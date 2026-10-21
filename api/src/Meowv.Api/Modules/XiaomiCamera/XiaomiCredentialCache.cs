using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Meowv.Api.Modules.XiaomiCamera.Cloud;
using Meowv.Api.Infrastructure;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>
/// 在服务端 SQLite 中直接保存小米云会话。仅保存已换取的云会话，
/// 从不保存小米账号密码、验证码或任何 HTTP 请求体。
/// </summary>
public sealed class XiaomiCredentialCache
{
    private readonly Lock _sessionGate = new();

    // 播放票据和媒体流只驻留本进程，会话代次无需写入持久化配置。
    private long _sessionVersion;
    public event Action<long>? SessionChanged;

    public long GetSessionVersion() => Volatile.Read(ref _sessionVersion);

    private readonly ApiDatabase _database;

    public XiaomiCredentialCache(ApiDatabase database)
    {
        _database = database;
        Initialize();
    }

    public XiaomiCloudCredentials? TryLoad() => TryLoad(out _);

    public XiaomiCloudCredentials? TryLoad(out long version)
    {
        string json;
        lock (_sessionGate)
        {
            version = _sessionVersion;
            using var connection = OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = """
                                  SELECT credentials_json
                                  FROM xiaomi_camera_state
                                  WHERE id = 1;
                                  """;
            using var reader = command.ExecuteReader();
            if (!reader.Read() || reader.IsDBNull(0))
            {
                return null;
            }

            json = reader.GetString(0);
        }

        // 读取连接已释放，清理无效会话时不会与自身的 SQLite 读锁互相等待。
        try
        {
            var credentials = JsonSerializer.Deserialize(json, XiaomiStorageJsonContext.Default.XiaomiCloudCredentials);
            if (IsValid(credentials)) return credentials;
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or FormatException)
        {
            // 损坏的会话按未登录处理，不向客户端暴露存储内容。
        }

        Clear(version);
        return null;
    }

    public void Save(XiaomiCloudCredentials credentials)
    {
        ArgumentNullException.ThrowIfNull(credentials);
        if (!IsValid(credentials))
        {
            throw new InvalidOperationException("小米云会话字段无效。");
        }

        var json = JsonSerializer.Serialize(credentials, XiaomiStorageJsonContext.Default.XiaomiCloudCredentials);
        long changedVersion;
        lock (_sessionGate)
        {
            using var connection = OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = """
                                  INSERT INTO xiaomi_camera_state (
                                      id, credentials_json, created_at, updated_at
                                  ) VALUES (
                                      1, $json, $now, $now
                                  )
                                  ON CONFLICT(id) DO UPDATE SET
                                      credentials_json = excluded.credentials_json,
                                      updated_at = excluded.updated_at;
                                  """;
            command.Parameters.AddWithValue("$json", json);
            command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
            _ = command.ExecuteNonQuery();
            changedVersion = Interlocked.Increment(ref _sessionVersion);
        }

        SessionChanged?.Invoke(changedVersion);
    }

    public bool Clear(long? expectedVersion = null)
    {
        long changedVersion;
        lock (_sessionGate)
        {
            // 旧请求的失败只能清除自己使用的会话，不能覆盖稍后保存的新登录。
            if (expectedVersion is { } expected && expected != _sessionVersion) return false;
            using var connection = OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = """
                                  UPDATE xiaomi_camera_state
                                  SET credentials_json = NULL,
                                      updated_at = $now
                                  WHERE id = 1;
                                  """;
            command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
            _ = command.ExecuteNonQuery();
            changedVersion = Interlocked.Increment(ref _sessionVersion);
        }

        SessionChanged?.Invoke(changedVersion);
        return true;
    }

    private void Initialize() => _database.EnsureSchema("xiaomi-camera", 2, """
        CREATE TABLE IF NOT EXISTS xiaomi_camera_state (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            credentials_json TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """);

    private SqliteConnection OpenConnection() => _database.OpenConnection();

    private static bool IsValid(XiaomiCloudCredentials? credentials)
    {
        if (credentials is null ||
            string.IsNullOrWhiteSpace(credentials.UserId) ||
            string.IsNullOrWhiteSpace(credentials.CUserId) ||
            string.IsNullOrWhiteSpace(credentials.ServiceToken) ||
            string.IsNullOrWhiteSpace(credentials.Region))
        {
            return false;
        }

        try
        {
            var ssecurity = credentials.GetSsecurityBytes();
            CryptographicOperations.ZeroMemory(ssecurity);
            return true;
        }
        catch (Exception exception) when (exception is InvalidOperationException or FormatException)
        {
            return false;
        }
    }
}