using System.Security.Cryptography;
using System.Text;
using Meowv.Api.Core;
using Meowv.Api.Infrastructure;

namespace Meowv.Api.Security;

public sealed class AccessCodeService : IAccessCodeService
{
    private const int SaltLength = 16;
    private const int HashLength = 32;
    private const int Iterations = 600_000;
    private readonly ApiDatabase _database;

    public AccessCodeService(ApiDatabase database)
    {
        _database = database;
        database.EnsureSchema("auth", 1, """
                                         CREATE TABLE IF NOT EXISTS auth_state (
                                             id INTEGER PRIMARY KEY CHECK(id = 1),
                                             access_code_salt BLOB NOT NULL,
                                             access_code_hash BLOB NOT NULL,
                                             access_code_version INTEGER NOT NULL CHECK(access_code_version > 0),
                                             access_code_updated_at TEXT NOT NULL
                                         );
                                         """);
    }

    public string? CreateIfMissing() => Save(onlyIfMissing: true);
    public string Rotate() => Save(onlyIfMissing: false)!;

    private string? Save(bool onlyIfMissing)
    {
        using var connection = _database.OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT access_code_version FROM auth_state WHERE id = 1;";
        var current = command.ExecuteScalar();
        if (onlyIfMissing && current is not null)
        {
            transaction.Commit();
            return null;
        }

        var version = checked((current is long value ? (int)value : 0) + 1);
        var bytes = RandomNumberGenerator.GetBytes(32);
        string code;
        try
        {
            code = "mv_" + Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }

        var salt = RandomNumberGenerator.GetBytes(SaltLength);
        var supplied = Encoding.UTF8.GetBytes(code);
        var hash = Rfc2898DeriveBytes.Pbkdf2(supplied, salt, Iterations, HashAlgorithmName.SHA512, HashLength);
        try
        {
            command.CommandText = """
                                  INSERT INTO auth_state(id, access_code_salt, access_code_hash, access_code_version, access_code_updated_at)
                                  VALUES(1, $salt, $hash, $version, $now)
                                  ON CONFLICT(id) DO UPDATE SET access_code_salt = excluded.access_code_salt,
                                      access_code_hash = excluded.access_code_hash, access_code_version = excluded.access_code_version,
                                      access_code_updated_at = excluded.access_code_updated_at;
                                  """;
            command.Parameters.AddWithValue("$salt", salt);
            command.Parameters.AddWithValue("$hash", hash);
            command.Parameters.AddWithValue("$version", version);
            command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
            command.ExecuteNonQuery();
            transaction.Commit();
            return code;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(salt);
            CryptographicOperations.ZeroMemory(supplied);
            CryptographicOperations.ZeroMemory(hash);
        }
    }

    public bool Verify(string? code, out int version)
    {
        version = 0;
        if (string.IsNullOrWhiteSpace(code) || code.Length > 256) return false;
        using var connection = _database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT access_code_salt, access_code_hash, access_code_version FROM auth_state WHERE id = 1;";
        using var reader = command.ExecuteReader();
        if (!reader.Read()) return false;
        var salt = (byte[])reader.GetValue(0);
        var expected = (byte[])reader.GetValue(1);
        var supplied = Encoding.UTF8.GetBytes(code);
        try
        {
            if (salt.Length != SaltLength || expected.Length != HashLength) return false;
            var hash = Rfc2898DeriveBytes.Pbkdf2(supplied, salt, Iterations, HashAlgorithmName.SHA512, HashLength);
            try
            {
                if (!CryptographicOperations.FixedTimeEquals(hash, expected)) return false;
                version = reader.GetInt32(2);
                return version > 0;
            }
            finally
            {
                CryptographicOperations.ZeroMemory(hash);
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(salt);
            CryptographicOperations.ZeroMemory(expected);
            CryptographicOperations.ZeroMemory(supplied);
        }
    }

    public int GetVersion()
    {
        using var connection = _database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT access_code_version FROM auth_state WHERE id = 1;";
        return command.ExecuteScalar() is long value ? checked((int)value) : 0;
    }
}