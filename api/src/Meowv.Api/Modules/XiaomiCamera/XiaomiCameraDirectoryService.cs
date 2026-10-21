using System.Security.Cryptography;
using System.Text;
using Meowv.Api.Modules.XiaomiCamera.Cloud;
using Meowv.Api.Modules.XiaomiCamera.Contracts;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>
/// 短时复用小米云设备目录与 CS2 探测结果，避免一次预览链路重复请求同一份元数据。
/// 缓存只包含设备公开信息和传输能力，不保存小米云会话字段。
/// </summary>
public sealed class XiaomiCameraDirectoryService(IHttpClientFactory httpClients)
{
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromSeconds(30);
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private CachedDirectory? _cached;

    public async Task<IReadOnlyList<XiaomiCameraDirectoryEntry>> GetAsync(XiaomiCloudCredentials credentials, CancellationToken cancellationToken)
    {
        var sessionId = CreateSessionId(credentials);
        if (TryGetCached(sessionId, out var entries))
        {
            return entries;
        }

        await _refreshLock.WaitAsync(cancellationToken);
        try
        {
            if (TryGetCached(sessionId, out entries))
            {
                return entries;
            }

            var catalog = new XiaomiCloudCameraCatalog(httpClients.CreateClient("xiaomi-cloud"), credentials);
            var cameras = await catalog.DiscoverAsync(cancellationToken);
            var resolved = new XiaomiCameraDirectoryEntry[cameras.Count];

            // 单次探测只读小米云；限制并发，避免多摄像头账户瞬时产生过多请求。
            await Parallel.ForEachAsync(
                Enumerable.Range(0, cameras.Count),
                new ParallelOptions { CancellationToken = cancellationToken, MaxDegreeOfParallelism = 4 },
                async (index, token) =>
                {
                    var camera = cameras[index];
                    var probe = await catalog.ProbeAsync(camera, token);
                    resolved[index] = new XiaomiCameraDirectoryEntry(camera, probe);
                });

            entries = resolved;
            Volatile.Write(ref _cached, new CachedDirectory(sessionId, DateTimeOffset.UtcNow.Add(CacheLifetime), entries));
            return entries;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    public async Task<XiaomiCameraDirectoryEntry?> FindAsync(XiaomiCloudCredentials credentials, string fingerprint, CancellationToken cancellationToken)
    {
        var entries = await GetAsync(credentials, cancellationToken);
        return entries.SingleOrDefault(entry => string.Equals(DeviceFingerprint(entry.Camera.Id), fingerprint, StringComparison.Ordinal));
    }

    public void Invalidate() => Volatile.Write(ref _cached, null);

    private bool TryGetCached(string sessionId, out IReadOnlyList<XiaomiCameraDirectoryEntry> entries)
    {
        var snapshot = Volatile.Read(ref _cached);
        if (snapshot is not null &&
            snapshot.ExpiresAt > DateTimeOffset.UtcNow &&
            string.Equals(snapshot.SessionId, sessionId, StringComparison.Ordinal))
        {
            entries = snapshot.Entries;
            return true;
        }

        entries = [];
        return false;
    }

    private static string CreateSessionId(XiaomiCloudCredentials credentials)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        Append(hash, credentials.UserId);
        Append(hash, credentials.CUserId);
        Append(hash, credentials.Ssecurity);
        Append(hash, credentials.ServiceToken);
        Append(hash, credentials.Region);
        return Convert.ToHexString(hash.GetHashAndReset());
    }

    private static void Append(IncrementalHash hash, string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value);
        try
        {
            hash.AppendData(bytes);
            hash.AppendData([0]);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    public static string DeviceFingerprint(string did) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(did))).ToLowerInvariant()[..12];

    private sealed record CachedDirectory(string SessionId, DateTimeOffset ExpiresAt, IReadOnlyList<XiaomiCameraDirectoryEntry> Entries);
}

public sealed record XiaomiCameraDirectoryEntry(CameraDescriptor Camera, CameraTransportProbeResult Probe);