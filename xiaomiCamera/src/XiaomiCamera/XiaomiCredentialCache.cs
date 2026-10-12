using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using XiaomiCamera.Cloud;

namespace XiaomiCamera;

/// <summary>
/// 在服务端 SQLite 中以 AES-GCM 保存小米云会话。仅保存已换取的云会话，
/// 从不保存小米账号密码、验证码或任何 HTTP 请求体。
/// </summary>
public sealed class XiaomiCredentialCache : IDisposable
{
    private const int NonceLength = 12;
    private const int TagLength = 16;
    private const int AccessCodeSaltLength = 16;
    private const int AccessCodeHashLength = 32;
    private const int AccessCodeIterations = 600_000;
    private readonly byte[] dataKey;
    private readonly string connectionString;

    public XiaomiCredentialCache(XiaomiCameraOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        dataKey = [.. options.DataKey];
        var directory = Path.GetDirectoryName(options.DataPath);
        if (string.IsNullOrWhiteSpace(directory))
        {
            throw new InvalidOperationException("XIAOMI_CAMERA_DATA_PATH 必须包含目录路径。");
        }

        Directory.CreateDirectory(directory);
        connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = options.DataPath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
        }.ToString();
        Initialize();
    }

    public XiaomiCloudCredentials? TryLoad()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT credentials_nonce, credentials_tag, credentials_ciphertext
                              FROM service_state
                              WHERE id = 1;
                              """;
        using var reader = command.ExecuteReader();
        if (!reader.Read() || reader.IsDBNull(0) || reader.IsDBNull(1) || reader.IsDBNull(2))
        {
            return null;
        }

        var nonce = (byte[])reader.GetValue(0);
        var tag = (byte[])reader.GetValue(1);
        var ciphertext = (byte[])reader.GetValue(2);
        try
        {
            if (nonce.Length != NonceLength || tag.Length != TagLength || ciphertext.Length == 0)
            {
                Clear();
                return null;
            }

            var plaintext = new byte[ciphertext.Length];
            try
            {
                using var cipher = new AesGcm(dataKey, TagLength);
                cipher.Decrypt(nonce, ciphertext, tag, plaintext);
                var credentials = JsonSerializer.Deserialize<XiaomiCloudCredentials>(plaintext);
                if (IsValid(credentials)) return credentials;
                Clear();
                return null;
            }
            catch (Exception exception) when (exception is CryptographicException or JsonException or InvalidOperationException or FormatException)
            {
                Clear();
                return null;
            }
            finally
            {
                CryptographicOperations.ZeroMemory(plaintext);
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(nonce);
            CryptographicOperations.ZeroMemory(tag);
            CryptographicOperations.ZeroMemory(ciphertext);
        }
    }

    public void Save(XiaomiCloudCredentials credentials)
    {
        ArgumentNullException.ThrowIfNull(credentials);
        if (!IsValid(credentials))
        {
            throw new InvalidOperationException("小米云会话字段无效。");
        }

        var plaintext = JsonSerializer.SerializeToUtf8Bytes(credentials);
        var nonce = RandomNumberGenerator.GetBytes(NonceLength);
        var tag = new byte[TagLength];
        var ciphertext = new byte[plaintext.Length];
        try
        {
            using (var cipher = new AesGcm(dataKey, TagLength))
            {
                cipher.Encrypt(nonce, plaintext, ciphertext, tag);
            }

            using var connection = OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = """
                                  INSERT INTO service_state (
                                      id, credentials_nonce, credentials_tag, credentials_ciphertext, created_at, updated_at
                                  ) VALUES (
                                      1, $nonce, $tag, $ciphertext, $now, $now
                                  )
                                  ON CONFLICT(id) DO UPDATE SET
                                      credentials_nonce = excluded.credentials_nonce,
                                      credentials_tag = excluded.credentials_tag,
                                      credentials_ciphertext = excluded.credentials_ciphertext,
                                      updated_at = excluded.updated_at;
                                  """;
            command.Parameters.AddWithValue("$nonce", nonce);
            command.Parameters.AddWithValue("$tag", tag);
            command.Parameters.AddWithValue("$ciphertext", ciphertext);
            command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
            _ = command.ExecuteNonQuery();
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
            CryptographicOperations.ZeroMemory(nonce);
            CryptographicOperations.ZeroMemory(tag);
            CryptographicOperations.ZeroMemory(ciphertext);
        }
    }

    public void Clear()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              UPDATE service_state
                              SET credentials_nonce = NULL,
                                  credentials_tag = NULL,
                                  credentials_ciphertext = NULL,
                                  updated_at = $now
                              WHERE id = 1;
                              """;
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        _ = command.ExecuteNonQuery();
    }

    /// <summary>仅在尚未生成过授权码时返回新值；已存在时绝不再返回原值。</summary>
    public string? CreateAccessCodeIfMissing()
    {
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        if (HasAccessCode(connection, transaction))
        {
            transaction.Commit();
            return null;
        }

        var accessCode = GenerateAccessCode();
        SaveAccessCode(connection, transaction, accessCode, nextVersion: 1);
        transaction.Commit();
        return accessCode;
    }

    /// <summary>生成新的授权码，并立即废止全部旧授权码。</summary>
    public string RotateAccessCode()
    {
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        var nextVersion = ReadAccessCodeVersion(connection, transaction) + 1;
        var accessCode = GenerateAccessCode();
        SaveAccessCode(connection, transaction, accessCode, nextVersion);
        transaction.Commit();
        return accessCode;
    }

    public bool VerifyAccessCode(string? accessCode)
    {
        if (string.IsNullOrWhiteSpace(accessCode))
        {
            return false;
        }

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT access_code_salt, access_code_hash
                              FROM service_state
                              WHERE id = 1;
                              """;
        using var reader = command.ExecuteReader();
        if (!reader.Read() || reader.IsDBNull(0) || reader.IsDBNull(1))
        {
            return false;
        }

        var salt = (byte[])reader.GetValue(0);
        var expectedHash = (byte[])reader.GetValue(1);
        var suppliedBytes = Encoding.UTF8.GetBytes(accessCode);
        try
        {
            if (salt.Length != AccessCodeSaltLength || expectedHash.Length != AccessCodeHashLength)
            {
                return false;
            }

            var derivedHash = Rfc2898DeriveBytes.Pbkdf2(
                suppliedBytes,
                salt,
                AccessCodeIterations,
                HashAlgorithmName.SHA512,
                AccessCodeHashLength);
            try
            {
                return CryptographicOperations.FixedTimeEquals(derivedHash, expectedHash);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(derivedHash);
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(salt);
            CryptographicOperations.ZeroMemory(expectedHash);
            CryptographicOperations.ZeroMemory(suppliedBytes);
        }
    }

    /// <summary>读取当前授权码版本，用于使已签发的播放票据在轮换后立即失效。</summary>
    public int GetAccessCodeVersion()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COALESCE(access_code_version, 0) FROM service_state WHERE id = 1;";
        return command.ExecuteScalar() is long value ? checked((int)value) : 0;
    }

    public void Dispose() => CryptographicOperations.ZeroMemory(dataKey);

    private void Initialize()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              CREATE TABLE IF NOT EXISTS service_state (
                                  id INTEGER PRIMARY KEY CHECK (id = 1),
                                  credentials_nonce BLOB NULL,
                                  credentials_tag BLOB NULL,
                                  credentials_ciphertext BLOB NULL,
                                  created_at TEXT NOT NULL,
                                  updated_at TEXT NOT NULL
                              );
                              """;
        _ = command.ExecuteNonQuery();
        EnsureColumn(connection, "access_code_salt BLOB NULL");
        EnsureColumn(connection, "access_code_hash BLOB NULL");
        EnsureColumn(connection, "access_code_prefix TEXT NULL");
        EnsureColumn(connection, "access_code_version INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(connection, "access_code_updated_at TEXT NULL");
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection(connectionString);
        connection.Open();
        return connection;
    }

    private static void EnsureColumn(SqliteConnection connection, string definition)
    {
        var columnName = definition.Split(' ', 2, StringSplitOptions.TrimEntries)[0];
        {
            using var columns = connection.CreateCommand();
            columns.CommandText = "PRAGMA table_info(service_state);";
            using var reader = columns.ExecuteReader();
            while (reader.Read())
            {
                if (string.Equals(reader.GetString(1), columnName, StringComparison.Ordinal))
                {
                    return;
                }
            }
        }

        using var alter = connection.CreateCommand();
        alter.CommandText = $"ALTER TABLE service_state ADD COLUMN {definition};";
        _ = alter.ExecuteNonQuery();
    }

    private static bool HasAccessCode(SqliteConnection connection, SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
                              SELECT 1
                              FROM service_state
                              WHERE id = 1 AND access_code_hash IS NOT NULL;
                              """;
        return command.ExecuteScalar() is not null;
    }

    private static int ReadAccessCodeVersion(SqliteConnection connection, SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT COALESCE(access_code_version, 0) FROM service_state WHERE id = 1;";
        return command.ExecuteScalar() is long value ? checked((int)value) : 0;
    }

    private static void SaveAccessCode(SqliteConnection connection, SqliteTransaction transaction, string accessCode, int nextVersion)
    {
        var salt = RandomNumberGenerator.GetBytes(AccessCodeSaltLength);
        var accessCodeBytes = Encoding.UTF8.GetBytes(accessCode);
        var hash = Rfc2898DeriveBytes.Pbkdf2(accessCodeBytes, salt, AccessCodeIterations, HashAlgorithmName.SHA512, AccessCodeHashLength);
        try
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                                  INSERT INTO service_state (
                                      id, access_code_salt, access_code_hash, access_code_prefix,
                                      access_code_version, access_code_updated_at, created_at, updated_at
                                  ) VALUES (
                                      1, $salt, $hash, $prefix, $version, $now, $now, $now
                                  )
                                  ON CONFLICT(id) DO UPDATE SET
                                      access_code_salt = excluded.access_code_salt,
                                      access_code_hash = excluded.access_code_hash,
                                      access_code_prefix = excluded.access_code_prefix,
                                      access_code_version = excluded.access_code_version,
                                      access_code_updated_at = excluded.access_code_updated_at,
                                      updated_at = excluded.updated_at;
                                  """;
            command.Parameters.AddWithValue("$salt", salt);
            command.Parameters.AddWithValue("$hash", hash);
            command.Parameters.AddWithValue("$prefix", accessCode[..Math.Min(accessCode.Length, 11)]);
            command.Parameters.AddWithValue("$version", nextVersion);
            command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
            _ = command.ExecuteNonQuery();
        }
        finally
        {
            CryptographicOperations.ZeroMemory(salt);
            CryptographicOperations.ZeroMemory(accessCodeBytes);
            CryptographicOperations.ZeroMemory(hash);
        }
    }

    private static string GenerateAccessCode()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        try
        {
            return $"xc_{Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')}";
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

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