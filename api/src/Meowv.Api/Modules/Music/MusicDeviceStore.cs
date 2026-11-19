using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Meowv.Api.Infrastructure;

namespace Meowv.Api.Modules.Music;

public sealed class MusicDeviceStore(ApiDatabase database, TimeProvider clock)
{
    private readonly Lock _gate = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastUsedWrites = new(StringComparer.Ordinal);
    private bool _initialized;

    private void Initialize()
    {
        lock (_gate)
        {
            if (_initialized) return;
            // 独立owner固定为v1；未来升级须提供显式迁移，不能直接递增EnsureSchema版本。
            database.EnsureSchema("music-devices", 1, """
                                                      CREATE TABLE music_device_tokens (
                                                          id TEXT PRIMARY KEY, alias TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
                                                          created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT
                                                      );
                                                      """);
            _initialized = true;
        }
    }

    public MusicDeviceIssued Issue(string? alias)
    {
        if (alias is null || alias.Any(char.IsControl) || alias.Trim().Length is < 1 or > 80) throw MusicException.Invalid();
        Initialize();
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction(deferred: false);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT COUNT(*) FROM music_device_tokens WHERE revoked_at IS NULL;";
        if ((long)command.ExecuteScalar()! >= 256) throw new MusicException("invalid_request", "设备凭据数量已达上限。");
        var id = Guid.NewGuid().ToString("N");
        var bytes = RandomNumberGenerator.GetBytes(32);
        string token;
        try
        {
            token = "mvm_" + Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }

        command.CommandText = "INSERT INTO music_device_tokens(id,alias,token_hash,created_at) VALUES($id,$alias,$hash,$now);";
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$alias", alias.Trim());
        command.Parameters.AddWithValue("$hash", Hash(token));
        command.Parameters.AddWithValue("$now", clock.GetUtcNow().UtcDateTime.ToString("O"));
        command.ExecuteNonQuery();
        transaction.Commit();
        return new MusicDeviceIssued(id, token);
    }

    public string? Verify(string token)
    {
        if (token.Length != 47 || !token.StartsWith("mvm_", StringComparison.Ordinal) ||
            token[4..].Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '_')) return null;
        Initialize();
        var now = clock.GetUtcNow();
        var hash = Hash(token);
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT id FROM music_device_tokens WHERE token_hash=$hash AND revoked_at IS NULL;";
        command.Parameters.AddWithValue("$hash", hash);
        if (command.ExecuteScalar() as string is not { } id) return null;
        if (_lastUsedWrites.TryGetValue(id, out var lastWrite) && now - lastWrite < TimeSpan.FromMinutes(1)) return id;

        command.Parameters.Clear();
        command.CommandText = "UPDATE music_device_tokens SET last_used_at=$now WHERE token_hash=$hash AND revoked_at IS NULL RETURNING id;";
        command.Parameters.AddWithValue("$hash", hash);
        command.Parameters.AddWithValue("$now", now.UtcDateTime.ToString("O"));
        var updated = command.ExecuteScalar() as string;
        if (updated is not null) _lastUsedWrites[updated] = now;
        return updated;
    }

    public MusicDevice[] List()
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT id,alias,created_at,last_used_at,revoked_at FROM music_device_tokens ORDER BY created_at DESC;";
        using var reader = command.ExecuteReader();
        var devices = new List<MusicDevice>();
        while (reader.Read())
            devices.Add(new MusicDevice(reader.GetString(0), reader.GetString(1), Parse(reader.GetString(2)),
                reader.IsDBNull(3) ? null : Parse(reader.GetString(3)), reader.IsDBNull(4) ? null : Parse(reader.GetString(4))));
        return [.. devices];
    }

    public bool Revoke(string id)
    {
        if (!Guid.TryParseExact(id, "N", out _)) throw MusicException.Invalid();
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "UPDATE music_device_tokens SET revoked_at=$now WHERE id=$id AND revoked_at IS NULL;";
        command.Parameters.AddWithValue("$now", clock.GetUtcNow().UtcDateTime.ToString("O"));
        command.Parameters.AddWithValue("$id", id);
        return command.ExecuteNonQuery() > 0;
    }

    private static DateTime Parse(string value) => DateTime.Parse(value, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.RoundtripKind);
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}