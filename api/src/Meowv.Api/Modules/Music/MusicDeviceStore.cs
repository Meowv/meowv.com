using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Meowv.Api.Infrastructure;
using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Music;

public sealed class MusicDeviceStore(ApiDatabase database, TimeProvider clock)
{
    private static readonly TimeSpan PendingLifetime = TimeSpan.FromHours(24);
    private readonly Lock _gate = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastUsedWrites = new(StringComparer.Ordinal);
    private bool _initialized;

    internal void Initialize()
    {
        lock (_gate)
        {
            if (_initialized) return;
            database.EnsureSchema("music-device-activation", 1, """
                                                                CREATE TABLE music_device_activation (
                                                                    installation_id TEXT PRIMARY KEY, device_id TEXT NOT NULL UNIQUE,
                                                                    short_code TEXT NOT NULL, public_key BLOB NOT NULL,
                                                                    model TEXT NOT NULL, os_version TEXT NOT NULL,
                                                                    status TEXT NOT NULL CHECK (status IN ('pending','active','revoked')),
                                                                    token_hash TEXT UNIQUE, encrypted_token TEXT,
                                                                    created_at TEXT NOT NULL, activated_at TEXT, revoked_at TEXT, last_seen TEXT
                                                                );
                                                                CREATE UNIQUE INDEX music_pending_short_code ON music_device_activation(short_code) WHERE status='pending';
                                                                CREATE INDEX music_device_activation_status ON music_device_activation(status,created_at);
                                                                """);
            database.EnsureSchema("music-device-removal", 1, """
                                                             CREATE TABLE music_removed_installations (
                                                                 installation_hash BLOB PRIMARY KEY NOT NULL
                                                             );
                                                             """);
            _initialized = true;
        }
    }

    public MusicDeviceStatus Register(MusicDeviceRegister input)
    {
        var installationId = DeviceGuid(input.InstallationId);
        var model = Label(input.Model, 80);
        var osVersion = Label(input.OsVersion, 32);
        var publicKey = PublicKey(input.PublicKey);
        var fingerprint = Convert.ToHexString(SHA256.HashData(publicKey).AsSpan(0, 4));
        var shortCode = fingerprint[..4] + "-" + fingerprint[4..];
        Initialize();
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction(deferred: false);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        var now = clock.GetUtcNow();
        command.Parameters.AddWithValue("$expiry", Timestamp(now - PendingLifetime));
        command.CommandText = "DELETE FROM music_device_activation WHERE status='pending' AND created_at<=$expiry;";
        command.ExecuteNonQuery();

        command.Parameters.Clear();
        command.Parameters.AddWithValue("$id", installationId);
        command.CommandText = "SELECT public_key,short_code,status FROM music_device_activation WHERE installation_id=$id;";
        using (var reader = command.ExecuteReader())
        {
            if (reader.Read())
            {
                if (!publicKey.AsSpan().SequenceEqual((byte[])reader[0]))
                    throw new MusicException("device_key_conflict", "此安装已绑定其他公钥。", 409);
                var result = new MusicDeviceStatus(installationId, reader.GetString(1), reader.GetString(2));
                reader.Close();
                transaction.Commit();
                return result;
            }
        }

        command.CommandText = "SELECT 1 FROM music_removed_installations WHERE installation_hash=$removed;";
        command.Parameters.AddWithValue("$removed", InstallationHash(installationId));
        if (command.ExecuteScalar() is not null) throw Removed();

        command.CommandText = "SELECT COUNT(*) FROM music_device_activation WHERE status='pending';";
        if ((long)command.ExecuteScalar()! >= 1000)
            throw new MusicException("device_queue_full", "待激活设备已达上限。", 429, 60);
        command.Parameters.AddWithValue("$short", shortCode);
        command.CommandText = "SELECT 1 FROM music_device_activation WHERE short_code=$short AND status='pending';";
        if (command.ExecuteScalar() is not null)
            throw new MusicException("device_code_conflict", "设备短码冲突，请重新生成设备身份。", 409);

        command.CommandText = """
                              INSERT INTO music_device_activation(installation_id,device_id,short_code,public_key,model,os_version,status,created_at)
                              VALUES($id,$device,$short,$key,$model,$os,'pending',$now);
                              """;
        command.Parameters.AddWithValue("$device", Guid.NewGuid().ToString("N"));
        command.Parameters.AddWithValue("$key", publicKey);
        command.Parameters.AddWithValue("$model", model);
        command.Parameters.AddWithValue("$os", osVersion);
        command.Parameters.AddWithValue("$now", Timestamp(now));
        command.ExecuteNonQuery();
        transaction.Commit();
        return new MusicDeviceStatus(installationId, shortCode, "pending");
    }

    public MusicDeviceStatus? Status(string id)
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT short_code,status,encrypted_token FROM music_device_activation WHERE installation_id=$id
                                AND (status<>'pending' OR created_at>$expiry)
                              UNION ALL
                              SELECT NULL,'removed',NULL FROM music_removed_installations WHERE installation_hash=$removed;
                              """;
        var installationId = DeviceGuid(id);
        command.Parameters.AddWithValue("$id", installationId);
        command.Parameters.AddWithValue("$removed", InstallationHash(installationId));
        command.Parameters.AddWithValue("$expiry", Timestamp(clock.GetUtcNow() - PendingLifetime));
        using var reader = command.ExecuteReader();
        if (!reader.Read()) return null;
        var status = reader.GetString(1);
        if (status == "removed") throw Removed();
        return new MusicDeviceStatus(installationId, reader.GetString(0), status,
            reader.IsDBNull(2) ? null : reader.GetString(2));
    }

    public MusicDeviceActivation? Activate(string id)
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction(deferred: false);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        var deviceId = DeviceGuid(id);
        var now = clock.GetUtcNow();
        command.Parameters.AddWithValue("$id", deviceId);
        command.Parameters.AddWithValue("$expiry", Timestamp(now - PendingLifetime));
        command.CommandText = """
                              SELECT installation_id,short_code,status,public_key FROM music_device_activation
                              WHERE device_id=$id AND (status<>'pending' OR created_at>$expiry);
                              """;
        MusicDeviceActivation result;
        byte[] publicKey;
        string status;
        using (var reader = command.ExecuteReader())
        {
            if (!reader.Read()) return null;
            status = reader.GetString(2);
            result = new MusicDeviceActivation(reader.GetString(0), deviceId, reader.GetString(1), "active");
            if (status == "active") return result;
            publicKey = (byte[])reader[3];
        }

        command.CommandText = "SELECT COUNT(*) FROM music_device_activation WHERE status='active';";
        if ((long)command.ExecuteScalar()! >= 256)
            throw new MusicException("device_limit_reached", "激活设备已达上限。", 409);
        using var rsa = RSA.Create();
        rsa.ImportSubjectPublicKeyInfo(publicKey, out _);
        var token = Encoding.ASCII.GetBytes("mvm_" + Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32)));
        try
        {
            if (status == "revoked") ClearQqGrant(command);
            command.CommandText = """
                                  UPDATE music_device_activation SET status='active',token_hash=$hash,encrypted_token=$encrypted,
                                      activated_at=$now,revoked_at=NULL,last_seen=NULL
                                  WHERE device_id=$id;
                                  """;
            command.Parameters.AddWithValue("$hash", Convert.ToHexString(SHA256.HashData(token)));
            // Android 9 Keystore 的 OAEP MGF1 固定使用 SHA-1。.NET 的 OAEP 两处摘要使用同一个算法。
            command.Parameters.AddWithValue("$encrypted", Base64Url.EncodeToString(rsa.Encrypt(token, RSAEncryptionPadding.OaepSHA1)));
            command.Parameters.AddWithValue("$now", Timestamp(now));
            command.ExecuteNonQuery();
            transaction.Commit();
            return result;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(token);
        }
    }

    public string? Verify(string token)
    {
        if (token.Length != 47 || !token.StartsWith("mvm_", StringComparison.Ordinal) ||
            token[4..].Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '_')) return null;
        Initialize();
        var now = clock.GetUtcNow();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.Parameters.AddWithValue("$hash", Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(token))));
        command.CommandText = "SELECT device_id FROM music_device_activation WHERE token_hash=$hash AND status='active';";
        if (command.ExecuteScalar() as string is not { } id) return null;
        if (_lastUsedWrites.TryGetValue(id, out var lastWrite) && now - lastWrite < TimeSpan.FromMinutes(1)) return id;

        command.Parameters.AddWithValue("$now", Timestamp(now));
        command.CommandText = """
                              UPDATE music_device_activation SET last_seen=$now WHERE token_hash=$hash AND status='active' RETURNING device_id;
                              """;
        var updated = command.ExecuteScalar() as string;
        if (updated is not null) _lastUsedWrites[updated] = now;
        return updated;
    }

    public MusicDevice[] List()
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT installation_id,device_id,short_code,model,os_version,status,created_at,activated_at,last_seen,revoked_at
                              FROM music_device_activation WHERE status<>'pending' OR created_at>$expiry
                              ORDER BY status='pending' DESC, created_at DESC;
                              """;
        command.Parameters.AddWithValue("$expiry", Timestamp(clock.GetUtcNow() - PendingLifetime));
        using var reader = command.ExecuteReader();
        var devices = new List<MusicDevice>();
        while (reader.Read())
            devices.Add(new MusicDevice(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.GetString(5), reader.GetDateTime(6), Date(7), Date(8), Date(9)));
        return [.. devices];

        DateTime? Date(int column) => reader.IsDBNull(column) ? null : reader.GetDateTime(column);
    }

    public bool Revoke(string id)
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              UPDATE music_device_activation SET status='revoked',revoked_at=COALESCE(revoked_at,$now),
                                  token_hash=NULL,encrypted_token=NULL WHERE device_id=$id RETURNING device_id;
                              """;
        command.Parameters.AddWithValue("$now", Timestamp(clock.GetUtcNow()));
        command.Parameters.AddWithValue("$id", DeviceGuid(id));
        if (command.ExecuteScalar() is not string deviceId) return false;
        _lastUsedWrites.TryRemove(deviceId, out _);
        return true;
    }

    public bool DeleteRevoked(string id)
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction(deferred: false);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        var deviceId = DeviceGuid(id);
        command.Parameters.AddWithValue("$id", deviceId);
        command.CommandText = "SELECT status FROM music_device_activation WHERE device_id=$id;";
        if (command.ExecuteScalar() is not string status) return false;
        if (status != "revoked")
            throw new MusicException("device_not_revoked", "请先撤销设备，再删除记录。", 409);

        command.CommandText = "DELETE FROM music_device_activation WHERE device_id=$id RETURNING installation_id;";
        var installationId = (string)command.ExecuteScalar()!;
        ClearQqGrant(command);
        // 只保留安装 ID 的哈希，App 重新登记时必须使用新身份。
        command.CommandText = "INSERT INTO music_removed_installations(installation_hash) VALUES($removed);";
        command.Parameters.AddWithValue("$removed", InstallationHash(installationId));
        command.ExecuteNonQuery();
        transaction.Commit();
        _lastUsedWrites.TryRemove(deviceId, out _);
        return true;
    }

    private static void ClearQqGrant(SqliteCommand command)
    {
        // 会员模块可能从未初始化。
        command.CommandText = "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='music_qq_devices';";
        if (command.ExecuteScalar() is null) return;
        command.CommandText = "DELETE FROM music_qq_devices WHERE device_id=$id;";
        command.ExecuteNonQuery();
    }

    private static MusicException Removed() => new("device_removed", "设备记录已删除，请重新登记新安装。", 410);

    private static byte[] InstallationHash(string id) => SHA256.HashData(Encoding.ASCII.GetBytes(id));

    private static string DeviceGuid(string? value) =>
        Guid.TryParseExact(value, "N", out var id) && id != Guid.Empty ? id.ToString("N") : throw MusicException.Invalid();

    private static string Label(string? value, int max) =>
        value is not null && value.Trim().Length > 0 && value.Length <= max && !value.Any(char.IsControl)
            ? value.Trim()
            : throw MusicException.Invalid();

    private static byte[] PublicKey(string? value)
    {
        if (value is not { Length: > 0 and <= 512 } ||
            value.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '_'))
            throw MusicException.Invalid();
        try
        {
            var bytes = Base64Url.DecodeFromChars(value);
            using var rsa = RSA.Create();
            rsa.ImportSubjectPublicKeyInfo(bytes, out var read);
            if (read != bytes.Length || rsa.KeySize != 2048) throw MusicException.Invalid();
            return rsa.ExportSubjectPublicKeyInfo();
        }
        catch (Exception error) when (error is CryptographicException or FormatException)
        {
            throw MusicException.Invalid();
        }
    }

    private static string Timestamp(DateTimeOffset now) => now.UtcDateTime.ToString("O");
}