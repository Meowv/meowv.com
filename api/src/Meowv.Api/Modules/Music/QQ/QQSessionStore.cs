using System.Security.Cryptography;
using System.Text.Json;
using Meowv.Api.Infrastructure;

namespace Meowv.Api.Modules.Music.QQ;

internal sealed class QQSessionStore(ApiDatabase database, MusicOptions options)
{
    private readonly Lock _gate = new();
    private bool _initialized;

    public bool Configured => options.QQMusicMemberEnabled && ConfigurationIssue is null;

    public string? ConfigurationIssue => options.QQMusicSessionKey switch
    {
        null or "" => "session_key_missing",
        { Length: 44 } key when IsKey(key) => null,
        _ => "session_key_invalid"
    };

    private static bool IsKey(string key)
    {
        Span<byte> decoded = stackalloc byte[32];
        var valid = Convert.TryFromBase64String(key, decoded, out var size) && size == 32;
        CryptographicOperations.ZeroMemory(decoded);
        return valid;
    }

    private void Initialize()
    {
        lock (_gate)
        {
            if (_initialized) return;
            database.EnsureSchema("music-qq-membership", 1, """
                                                            CREATE TABLE music_qq_session (
                                                                id INTEGER PRIMARY KEY CHECK (id = 1),
                                                                sealed_credential BLOB NOT NULL
                                                            );
                                                            CREATE TABLE music_qq_devices (device_id TEXT PRIMARY KEY);
                                                            """);
            _initialized = true;
        }
    }

    public QQAccountClient.Credential? Load()
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT sealed_credential FROM music_qq_session WHERE id = 1;";
        if (command.ExecuteScalar() is not byte[] envelope) return null;
        if (envelope.Length is < 30 or > 8192 || envelope[0] != 1) throw new CryptographicException();
        var plaintext = new byte[envelope.Length - 29];
        try
        {
            using var cipher = Cipher();
            cipher.Decrypt(envelope.AsSpan(1, 12), envelope.AsSpan(29), envelope.AsSpan(13, 16), plaintext,
                "meowv/music/qq-session/v1"u8);
            return JsonSerializer.Deserialize(plaintext, QQJsonContext.Default.Credential) ?? throw new CryptographicException();
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
        }
    }

    public void Save(QQAccountClient.Credential credential)
    {
        Initialize();
        var plaintext = JsonSerializer.SerializeToUtf8Bytes(credential, QQJsonContext.Default.Credential);
        var envelope = new byte[29 + plaintext.Length];
        envelope[0] = 1;
        RandomNumberGenerator.Fill(envelope.AsSpan(1, 12));
        try
        {
            using var cipher = Cipher();
            cipher.Encrypt(envelope.AsSpan(1, 12), plaintext, envelope.AsSpan(29), envelope.AsSpan(13, 16),
                "meowv/music/qq-session/v1"u8);
            using var connection = database.OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = """
                                  INSERT INTO music_qq_session(id, sealed_credential) VALUES (1, $value)
                                  ON CONFLICT(id) DO UPDATE SET sealed_credential = excluded.sealed_credential;
                                  """;
            command.Parameters.AddWithValue("$value", envelope);
            command.ExecuteNonQuery();
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
        }
    }

    public void Clear()
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM music_qq_session WHERE id = 1;";
        command.ExecuteNonQuery();
    }

    public string[] Devices()
    {
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT g.device_id FROM music_qq_devices g JOIN music_device_activation d ON d.device_id = g.device_id
                              WHERE d.status='active' ORDER BY g.device_id;
                              """;
        using var reader = command.ExecuteReader();
        var result = new List<string>();
        while (reader.Read()) result.Add(reader.GetString(0));
        return [.. result];
    }

    public bool Allowed(string id)
    {
        if (!Guid.TryParseExact(id, "N", out _)) return false;
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT 1 FROM music_qq_devices g JOIN music_device_activation d ON d.device_id = g.device_id
                              WHERE d.status='active' AND g.device_id = $id;
                              """;
        command.Parameters.AddWithValue("$id", id);
        return command.ExecuteScalar() is long;
    }

    public bool SetDevice(string id, bool enabled)
    {
        if (!Guid.TryParseExact(id, "N", out _)) throw MusicException.Invalid();
        Initialize();
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.Parameters.AddWithValue("$id", id);
        command.CommandText = enabled
            ? """
              INSERT INTO music_qq_devices(device_id)
              SELECT device_id FROM music_device_activation WHERE device_id = $id AND status='active'
              ON CONFLICT(device_id) DO UPDATE SET device_id = excluded.device_id;
              """
            : "DELETE FROM music_qq_devices WHERE device_id = $id;";
        return command.ExecuteNonQuery() > 0 || !enabled;
    }

    private AesGcm Cipher()
    {
        Span<byte> decoded = stackalloc byte[32];
        try
        {
            if (!Convert.TryFromBase64String(options.QQMusicSessionKey, decoded, out var length) || length != 32)
                throw new CryptographicException();
            return new AesGcm(decoded, 16);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(decoded);
        }
    }
}