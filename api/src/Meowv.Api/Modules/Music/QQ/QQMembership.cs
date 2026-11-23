using System.Net.WebSockets;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Meowv.Api.Infrastructure;
using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Music.QQ;

internal sealed class QQMembership(QQSessionStore store, QQAccountClient client, MusicOptions options, MusicDeviceStore devices, TimeProvider clock, IHostApplicationLifetime lifetime)
{
    private readonly Lock _gate = new();
    private readonly SemaphoreSlim _checks = new(1);
    private readonly Dictionary<QQAccountClient.Mp3, (bool Allowed, DateTimeOffset Until)> _verified = [];
    private DateTimeOffset _retryAt;
    private bool _loaded;
    private string _status = "signed_out";
    private QQAccountClient.Credential? _credential;
    private Pending? _attempt;

    private sealed class Pending(DateTimeOffset expiresAt, CancellationToken stopping)
    {
        public readonly Guid Id = Guid.NewGuid();
        public readonly DateTimeOffset ExpiresAt = expiresAt;
        public readonly CancellationTokenSource Cancellation = CancellationTokenSource.CreateLinkedTokenSource(stopping);
        public string Status = "starting";
        public byte[]? Image;
        public bool Active => Status is "starting" or "pending" or "scanned";
        public QQLoginAttempt Snapshot() => new(Id, Status, Image is not null, ExpiresAt);
    }

    public QQSessionStatus Status()
    {
        lock (_gate)
        {
            if (!options.QQMusicMemberEnabled) return new QQSessionStatus("disabled", null, [], false);
            if (store.ConfigurationIssue is { } issue) return new QQSessionStatus("unavailable", null, [], false, issue);
            ReadSession();
            try
            {
                devices.Initialize();
                return new QQSessionStatus(_status, _attempt?.Snapshot(), store.Devices(), true);
            }
            catch (Exception error) when (StorageError(error))
            {
                return new QQSessionStatus("unavailable", _attempt?.Snapshot(), [], true);
            }
        }
    }

    public QQLoginAttempt Start()
    {
        RequireConfigured();
        lock (_gate)
        {
            // 重复点击共享同一次扫码，避免重复发起上游登录。
            if (_attempt is { Active: true } existing) return existing.Snapshot();
            var attempt = new Pending(clock.GetUtcNow().AddMinutes(3), lifetime.ApplicationStopping);
            attempt.Cancellation.CancelAfter(TimeSpan.FromMinutes(3));
            _attempt = attempt;
            _ = RunAsync(attempt);
            return attempt.Snapshot();
        }
    }

    public byte[]? Image(Guid id)
    {
        lock (_gate)
            return _attempt is { Status: "pending" } pending && pending.Id == id && pending.ExpiresAt > clock.GetUtcNow() ? pending.Image : null;
    }

    public void Cancel(Guid id)
    {
        lock (_gate)
            if (_attempt is { Active: true } pending && pending.Id == id)
                StopAttempt(pending);
    }

    public void Logout()
    {
        RequireConfigured();
        lock (_gate)
        {
            if (_attempt is { Active: true } pending) StopAttempt(pending);
            _attempt = null;
            try
            {
                store.Clear();
            }
            catch (Exception error) when (StorageError(error))
            {
                throw QQAccountClient.Unavailable();
            }

            SetSession(null, "signed_out");
        }
    }

    public bool SetDevice(string id, bool enabled)
    {
        RequireConfigured();
        try
        {
            devices.Initialize();
            return store.SetDevice(id, enabled);
        }
        catch (Exception error) when (StorageError(error))
        {
            throw QQAccountClient.Unavailable();
        }
    }

    public Access? ForDevice(HttpContext context)
    {
        var id = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!store.Configured || !Guid.TryParseExact(id, "N", out _)) return null;
        lock (_gate)
        {
            ReadSession();
            return _credential is { } credential && IsAllowed(id) ? new Access(this, id, credential) : null;
        }
    }

    internal sealed class Access(QQMembership owner, string device, QQAccountClient.Credential credential)
    {
        public bool Current => owner.Current(device, credential);

        public Task<HashSet<string>> CheckAsync(QQAccountClient.Mp3[] tracks, CancellationToken ct) => owner.CheckAsync(device, credential, tracks, ct);

        public Task<QQAccountClient.Resource?> ResolveAsync(QQAccountClient.Mp3 track, CancellationToken ct) => owner.ResolveAsync(device, credential, track, ct);
    }

    private bool IsAllowed(string id)
    {
        try
        {
            return store.Allowed(id);
        }
        catch (Exception error) when (StorageError(error))
        {
            return false;
        }
    }

    private bool Current(string device, QQAccountClient.Credential credential)
    {
        lock (_gate)
        {
            ReadSession();
            return ReferenceEquals(_credential, credential) && IsAllowed(device);
        }
    }

    private async Task<HashSet<string>> CheckAsync(string device, QQAccountClient.Credential credential, QQAccountClient.Mp3[] tracks, CancellationToken ct)
    {
        var allowed = new HashSet<string>(StringComparer.Ordinal);
        if (tracks.Length == 0) return allowed;
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(2));
        try
        {
            await _checks.WaitAsync(budget.Token);
            try
            {
                QQAccountClient.Mp3[] unknown;
                lock (_gate)
                {
                    if (!ReferenceEquals(_credential, credential)) return allowed;
                    var now = clock.GetUtcNow();
                    foreach (var pair in _verified.Where(pair => pair.Value.Until <= now).ToArray()) _verified.Remove(pair.Key);
                    foreach (var track in tracks)
                        if (_verified.TryGetValue(track, out var hit) && hit.Allowed)
                            allowed.Add(track.Mid);
                    unknown = now >= _retryAt ? tracks.Where(track => !_verified.ContainsKey(track)).Take(30).ToArray() : [];
                }

                if (unknown.Length > 0)
                {
                    var checkedTracks = await client.GetStreamsAsync(credential, unknown, budget.Token);
                    lock (_gate)
                    {
                        if (!ReferenceEquals(_credential, credential)) return [];
                        var now = clock.GetUtcNow();
                        foreach (var track in unknown)
                        {
                            if (checkedTracks.Streams.TryGetValue(track.Mid, out var resources) && resources[0].ExpiresAt > now)
                            {
                                Put(track, true, resources[0].ExpiresAt);
                                allowed.Add(track.Mid);
                            }
                            else if (checkedTracks.Denied.Contains(track.Mid)) Put(track, false, now.AddMinutes(1));
                        }
                    }
                }
            }
            finally
            {
                _checks.Release();
            }
        }
        catch (QQSessionExpiredException)
        {
            Expire(credential);
        }
        catch (MusicException error) when (error.Status == 429)
        {
            Backoff(credential, error);
        }
        catch (Exception error) when (RequestError(error, ct))
        {
        }

        return Current(device, credential) ? allowed : [];
    }

    private async Task<QQAccountClient.Resource?> ResolveAsync(string device, QQAccountClient.Credential credential, QQAccountClient.Mp3 track, CancellationToken ct)
    {
        if (!Current(device, credential)) return null;
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(5));
        try
        {
            await _checks.WaitAsync(budget.Token);
            try
            {
                lock (_gate)
                    if (!ReferenceEquals(_credential, credential) || clock.GetUtcNow() < _retryAt)
                        return null;
                var entitled = await client.GetStreamsAsync(credential, [track], budget.Token);
                QQAccountClient.Resource? resource = null;
                if (entitled.Streams.TryGetValue(track.Mid, out var available))
                    resource = await client.ConfirmAsync(track, available, budget.Token);
                if (!Current(device, credential)) return null;
                lock (_gate)
                {
                    if (!ReferenceEquals(_credential, credential)) return null;
                    var now = clock.GetUtcNow();
                    if (resource?.ExpiresAt <= now) resource = null;
                    if (resource is not null) Put(track, true, resource.ExpiresAt);
                    else if (available is not null || entitled.Denied.Contains(track.Mid)) Put(track, false, now.AddMinutes(1));
                    return resource;
                }
            }
            finally
            {
                _checks.Release();
            }
        }
        catch (QQSessionExpiredException)
        {
            Expire(credential);
        }
        catch (MusicException error) when (error.Status == 429)
        {
            Backoff(credential, error);
        }
        catch (Exception error) when (RequestError(error, ct))
        {
        }

        return null;
    }

    private void Put(QQAccountClient.Mp3 track, bool allowed, DateTimeOffset until)
    {
        if (_verified.Count >= 512 && !_verified.ContainsKey(track)) _verified.Remove(_verified.MinBy(pair => pair.Value.Until).Key);
        _verified[track] = (allowed, until);
    }

    private void Backoff(QQAccountClient.Credential credential, MusicException error)
    {
        lock (_gate)
            if (ReferenceEquals(_credential, credential))
                _retryAt = clock.GetUtcNow().AddSeconds(Math.Clamp(error.RetryAfterSeconds ?? 60, 1, 3600));
    }

    private async Task RunAsync(Pending attempt)
    {
        var ct = attempt.Cancellation.Token;
        try
        {
            var qr = await client.CreateQrAsync(ct);
            await QQLoginSocket.ListenAsync(qr.Id, () =>
            {
                lock (_gate)
                    if (ReferenceEquals(attempt, _attempt) && attempt.Active)
                    {
                        attempt.Image = qr.Image;
                        attempt.Status = "pending";
                    }
            }, async (type, payload) =>
            {
                switch (type)
                {
                    case "scanned":
                        UpdateAttempt(attempt, "scanned");
                        return false;
                    case "canceled":
                        UpdateAttempt(attempt, "denied");
                        return true;
                    case "timeout":
                        UpdateAttempt(attempt, "expired");
                        return true;
                    case "loginFailed":
                        UpdateAttempt(attempt, "failed");
                        return true;
                    case "cookies":
                        var credential = await client.CompleteLoginAsync(qr.Id, payload, ct);
                        lock (_gate)
                        {
                            if (!ReferenceEquals(attempt, _attempt) || !attempt.Active || ct.IsCancellationRequested) return true;
                            store.Save(credential);
                            SetSession(credential, "connected");
                            UpdateAttempt(attempt, "succeeded");
                        }

                        return true;
                    default: return false;
                }
            }, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            UpdateAttempt(attempt, "expired");
        }
        catch (Exception error) when (RequestError(error, CancellationToken.None) || StorageError(error) || error is WebSocketException or TimeoutException)
        {
            UpdateAttempt(attempt, "failed");
        }
        finally
        {
            UpdateAttempt(attempt, "failed");
            attempt.Cancellation.Dispose();
        }
    }

    private void UpdateAttempt(Pending attempt, string status)
    {
        lock (_gate)
        {
            if (!ReferenceEquals(attempt, _attempt) || !attempt.Active) return;
            attempt.Image = null;
            attempt.Status = status;
        }
    }

    private static void StopAttempt(Pending pending)
    {
        pending.Status = "canceled";
        pending.Image = null;
        pending.Cancellation.Cancel();
    }

    private void ReadSession()
    {
        if (!_loaded)
        {
            try
            {
                var credential = store.Load();
                SetSession(credential, credential is null ? "signed_out" : "connected");
            }
            catch (Exception error) when (StorageError(error))
            {
                _status = "unavailable";
            }
        }

        if (_credential?.ExpiresAt <= clock.GetUtcNow()) Expire(_credential);
    }

    private void Expire(QQAccountClient.Credential credential)
    {
        lock (_gate)
        {
            if (!ReferenceEquals(_credential, credential)) return;
            SetSession(null, "expired");
            try
            {
                store.Clear();
            }
            catch (Exception error) when (StorageError(error))
            {
            }
        }
    }

    private void SetSession(QQAccountClient.Credential? credential, string status)
    {
        _credential = credential;
        _status = status;
        _loaded = true;
        _verified.Clear();
        _retryAt = default;
    }

    private void RequireConfigured()
    {
        if (!store.Configured) throw QQAccountClient.Unavailable();
    }

    private static bool RequestError(Exception error, CancellationToken ct) => error is MusicException or HttpRequestException or IOException or JsonException or UriFormatException || error is OperationCanceledException && !ct.IsCancellationRequested;

    private static bool StorageError(Exception error) => error is SqliteException or ApiDatabaseSchemaException or CryptographicException or IOException or JsonException;
}