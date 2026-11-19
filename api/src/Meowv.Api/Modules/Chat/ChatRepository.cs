using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Meowv.Api.Infrastructure;

namespace Meowv.Api.Modules.Chat;

public sealed class ChatRepository(ApiDatabase database, ChatOptions options)
{
    internal const string Schema = """
                                   CREATE TABLE chat_guest_sessions (
                                       guest_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL,
                                       avatar_seed TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
                                       revoked_at TEXT);
                                   CREATE INDEX ix_chat_guest_sessions_expires ON chat_guest_sessions(expires_at);
                                   CREATE TABLE chat_messages (
                                       id INTEGER PRIMARY KEY AUTOINCREMENT, guest_id TEXT NOT NULL, client_message_id TEXT NOT NULL,
                                       nickname_snapshot TEXT NOT NULL, avatar_seed_snapshot TEXT NOT NULL, content TEXT NOT NULL,
                                       created_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 0, UNIQUE(guest_id, client_message_id));
                                   CREATE INDEX ix_chat_messages_created ON chat_messages(created_at);
                                   CREATE TABLE chat_moderation_logs (
                                       id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target TEXT NOT NULL,
                                       actor TEXT, reason TEXT, created_at TEXT NOT NULL);
                                   CREATE INDEX ix_chat_moderation_logs_created ON chat_moderation_logs(created_at);
                                   """;

    public void Initialize()
    {
        database.EnsureSchema("chat", 2, Schema);
        using var connection = database.OpenConnection();
        using var command = Command(connection, "CREATE TABLE IF NOT EXISTS chat_message_replies(message_id INTEGER PRIMARY KEY,reply_to_id INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS ix_chat_message_replies_target ON chat_message_replies(reply_to_id);");
        command.ExecuteNonQuery();
        command.CommandText = "CREATE TABLE IF NOT EXISTS chat_message_mentions(message_id INTEGER NOT NULL,guest_id TEXT NOT NULL,nickname_snapshot TEXT NOT NULL,start INTEGER NOT NULL,length INTEGER NOT NULL,PRIMARY KEY(message_id,start));";
        command.ExecuteNonQuery();
        EnsureAuditColumns(connection);
    }

    private static void EnsureAuditColumns(SqliteConnection connection)
    {
        var columns = new HashSet<string>(StringComparer.Ordinal);
        using (var pragma = connection.CreateCommand())
        {
            pragma.CommandText = "PRAGMA table_info(chat_moderation_logs);";
            using var reader = pragma.ExecuteReader();
            while (reader.Read()) columns.Add(reader.GetString(1));
        }

        using var alter = connection.CreateCommand();
        if (!columns.Contains("actor"))
        {
            alter.CommandText = "ALTER TABLE chat_moderation_logs ADD COLUMN actor TEXT;";
            alter.ExecuteNonQuery();
        }

        if (!columns.Contains("reason"))
        {
            alter.CommandText = "ALTER TABLE chat_moderation_logs ADD COLUMN reason TEXT;";
            alter.ExecuteNonQuery();
        }
    }

    internal static string Time(DateTimeOffset value) => value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
    private static DateTimeOffset Parse(string value) => DateTimeOffset.Parse(value, CultureInfo.InvariantCulture);
    private static DateTimeOffset? OptionalTime(SqliteDataReader reader, int index) => reader.IsDBNull(index) ? null : Parse(reader.GetString(index));

    private static SqliteCommand Command(SqliteConnection connection, string sql, params (string Name, object? Value)[] parameters)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        return command;
    }

    internal ChatSession? FindSession(string tokenHash)
    {
        using var connection = database.OpenConnection();
        using var command = Command(connection, "SELECT guest_id, nickname, avatar_seed, expires_at, revoked_at FROM chat_guest_sessions WHERE token_hash=$hash", ("$hash", tokenHash));
        using var reader = command.ExecuteReader();
        return reader.Read() ? new ChatSession(tokenHash, new ChatGuest(reader.GetString(0), reader.GetString(1), reader.GetString(2)), Parse(reader.GetString(3)), OptionalTime(reader, 4)) : null;
    }

    internal ChatSession CreateSession(string tokenHash, string nickname)
    {
        var now = DateTimeOffset.UtcNow;
        var session = new ChatSession(tokenHash, new ChatGuest(Guid.NewGuid().ToString(), nickname, Guid.NewGuid().ToString("N")[..12]), now.AddDays(options.SessionDays), null);
        using var connection = database.OpenConnection();
        using var command = Command(connection, "INSERT INTO chat_guest_sessions(guest_id,token_hash,nickname,avatar_seed,created_at,expires_at) VALUES($id,$hash,$name,$avatar,$now,$expires)",
            ("$id", session.Guest.Id), ("$hash", tokenHash), ("$name", nickname), ("$avatar", session.Guest.AvatarSeed), ("$now", Time(now)), ("$expires", Time(session.ExpiresAt)));
        command.ExecuteNonQuery();
        return session;
    }

    internal ChatSession? RenameSession(string tokenHash, string nickname)
    {
        using var connection = database.OpenConnection();
        using var command = Command(connection,
            "UPDATE chat_guest_sessions SET nickname=$name WHERE token_hash=$hash AND revoked_at IS NULL AND expires_at > $now;",
            ("$name", nickname), ("$hash", tokenHash), ("$now", Time(DateTimeOffset.UtcNow)));
        return command.ExecuteNonQuery() == 0 ? null : FindSession(tokenHash);
    }

    internal void Revoke(string hash)
    {
        using var connection = database.OpenConnection();
        using var command = Command(connection, "UPDATE chat_guest_sessions SET revoked_at=$now WHERE token_hash=$hash", ("$hash", hash), ("$now", Time(DateTimeOffset.UtcNow)));
        command.ExecuteNonQuery();
    }

    private ChatMessage ReadMessage(SqliteDataReader reader) => new(
        reader.GetInt64(0).ToString(CultureInfo.InvariantCulture), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
        reader.IsDBNull(7) ? reader.GetString(5) : "", Parse(reader.GetString(6)), !reader.IsDBNull(7), reader.GetInt32(8), reader.IsDBNull(7) ? ReadReply(reader) : null, reader.IsDBNull(7) ? JsonSerializer.Deserialize(reader.GetString(15), ChatJsonContext.Default.ChatMentionArray) ?? [] : []);

    private ChatReply? ReadReply(SqliteDataReader reader)
    {
        if (reader.IsDBNull(9)) return null;
        var id = reader.GetInt64(9).ToString(CultureInfo.InvariantCulture);
        if (reader.IsDBNull(10) || (options.MessageCleanupEnabled && Parse(reader.GetString(13)) < DateTimeOffset.UtcNow.AddDays(-options.RetentionDays)))
            return new ChatReply(id, "", "", false, true, 0);
        var deleted = !reader.IsDBNull(12);
        var content = deleted ? "" : ChatMarkdown.Summary(reader.GetString(11));
        return new ChatReply(id, reader.GetString(10), content, deleted, false, reader.GetInt32(14));
    }

    private const string MessageColumns = "m.id,m.client_message_id,m.guest_id,m.nickname_snapshot,m.avatar_seed_snapshot,m.content,m.created_at,m.deleted_at,m.revision,r.reply_to_id,q.nickname_snapshot,q.content,q.deleted_at,q.created_at,q.revision,COALESCE((SELECT json_group_array(json_object('guestId',t.guest_id,'nickname',t.nickname_snapshot,'start',t.start,'length',t.length)) FROM chat_message_mentions t WHERE t.message_id=m.id),'[]')";
    private const string MessageTables = "chat_messages m LEFT JOIN chat_message_replies r ON r.message_id=m.id LEFT JOIN chat_messages q ON q.id=r.reply_to_id";

    internal ChatMessage? FindDuplicate(string guestId, string clientId)
    {
        using var connection = database.OpenConnection();
        using var command = Command(connection, $"SELECT {MessageColumns} FROM {MessageTables} WHERE m.guest_id=$guest AND m.client_message_id=$client", ("$guest", guestId), ("$client", clientId));
        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadMessage(reader) : null;
    }

    internal ChatMessage Insert(ChatSession session, string clientId, string content, string? replyToId = null, ChatMention[]? mentions = null)
    {
        var now = DateTimeOffset.UtcNow;
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = Command(connection, """
                                                INSERT INTO chat_messages(guest_id,client_message_id,nickname_snapshot,avatar_seed_snapshot,content,created_at)
                                                VALUES($guest,$client,$name,$avatar,$content,$now) RETURNING id;
                                                """, ("$guest", session.Guest.Id), ("$client", clientId), ("$name", session.Guest.Nickname), ("$avatar", session.Guest.AvatarSeed), ("$content", content), ("$now", Time(now)));
        command.Transaction = transaction;
        var id = (long)command.ExecuteScalar()!;
        if (replyToId is not null)
        {
            command.CommandText = "INSERT INTO chat_message_replies(message_id,reply_to_id) VALUES($message,$reply)";
            command.Parameters.Clear();
            command.Parameters.AddWithValue("$message", id);
            command.Parameters.AddWithValue("$reply", replyToId);
            command.ExecuteNonQuery();
        }

        foreach (var mention in mentions ?? [])
        {
            command.CommandText = "INSERT INTO chat_message_mentions(message_id,guest_id,nickname_snapshot,start,length) VALUES($message,$guest,$name,$start,$length)";
            command.Parameters.Clear();
            command.Parameters.AddWithValue("$message", id);
            command.Parameters.AddWithValue("$guest", mention.GuestId);
            command.Parameters.AddWithValue("$name", mention.Nickname);
            command.Parameters.AddWithValue("$start", mention.Start);
            command.Parameters.AddWithValue("$length", mention.Length);
            command.ExecuteNonQuery();
        }

        transaction.Commit();
        return new ChatMessage(id.ToString(CultureInfo.InvariantCulture), clientId, session.Guest.Id, session.Guest.Nickname, session.Guest.AvatarSeed, content, now, false, 0, replyToId is null ? null : Message(id.ToString(CultureInfo.InvariantCulture))!.Reply, mentions ?? []);
    }

    public ChatMessagePage History(long? before, long? after, int limit)
    {
        using var connection = database.OpenConnection();
        var condition = before.HasValue ? "AND m.id < $cursor" : after.HasValue ? "AND m.id > $cursor" : "";
        var direction = after.HasValue ? "ASC" : "DESC";
        var retention = options.MessageCleanupEnabled ? "AND m.created_at >= $cutoff" : "";
        using var command = Command(connection, $"SELECT {MessageColumns} FROM {MessageTables} WHERE 1=1 {retention} {condition} ORDER BY m.id {direction} LIMIT $limit",
            ("$limit", limit + 1));
        if (options.MessageCleanupEnabled) command.Parameters.AddWithValue("$cutoff", Time(DateTimeOffset.UtcNow.AddDays(-options.RetentionDays)));
        if (before.HasValue || after.HasValue) command.Parameters.AddWithValue("$cursor", before ?? after!.Value);
        using var reader = command.ExecuteReader();
        var messages = new List<ChatMessage>();
        while (reader.Read()) messages.Add(ReadMessage(reader));
        var hasMore = messages.Count > limit;
        if (hasMore) messages.RemoveAt(messages.Count - 1);
        if (!after.HasValue) messages.Reverse();
        return new ChatMessagePage([.. messages], hasMore, messages.Count == 0 ? null : after.HasValue ? messages[^1].Id : messages[0].Id);
    }

    public bool DeleteMessage(string target, bool permanent) =>
        DeleteMessage(target, permanent, DateTimeOffset.UtcNow, null, null, out _, out _);

    public bool DeleteMessage(string target, bool permanent, DateTimeOffset deletedAt, string? actor, string? reason,
        out long revision, out DateTimeOffset appliedAt)
    {
        revision = 0;
        appliedAt = deletedAt;
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.Parameters.AddWithValue("$target", target);
        command.Parameters.AddWithValue("$now", Time(deletedAt));
        if (permanent)
        {
            command.CommandText = "SELECT revision FROM chat_messages WHERE id=$target;";
            var existing = command.ExecuteScalar();
            if (existing is null) return false;
            revision = (long)existing;
            command.CommandText = "DELETE FROM chat_messages WHERE id=$target;";
            command.ExecuteNonQuery();
            command.CommandText = "DELETE FROM chat_message_replies WHERE message_id=$target; DELETE FROM chat_message_mentions WHERE message_id=$target;";
            command.ExecuteNonQuery();
        }
        else
        {
            command.CommandText = "UPDATE chat_messages SET deleted_at=$now,revision=revision+1 WHERE id=$target AND deleted_at IS NULL RETURNING revision;";
            var result = command.ExecuteScalar();
            if (result is null) return false;
            revision = (long)result;
        }

        WriteAudit(command, permanent ? "purge" : "delete", target, actor, reason, deletedAt);
        transaction.Commit();
        return true;
    }

    public ChatMessage? Message(string target)
    {
        using var connection = database.OpenConnection();
        using var command = Command(connection, $"SELECT {MessageColumns} FROM {MessageTables} WHERE m.id=$id", ("$id", target));
        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadMessage(reader) : null;
    }

    public ChatMessage? RestoreMessage(string target) => RestoreMessage(target, null, null);

    public ChatMessage? RestoreMessage(string target, string? actor, string? reason)
    {
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = Command(connection, "UPDATE chat_messages SET deleted_at=NULL,revision=revision+1 WHERE id=$target AND deleted_at IS NOT NULL RETURNING revision;", ("$target", target));
        command.Transaction = transaction;
        if (command.ExecuteScalar() is null) return null;
        var now = DateTimeOffset.UtcNow;
        WriteAudit(command, "restore", target, actor, reason, now);
        command.CommandText = $"SELECT {MessageColumns} FROM {MessageTables} WHERE m.id=$target";
        ChatMessage message;
        using (var reader = command.ExecuteReader())
        {
            reader.Read();
            message = ReadMessage(reader);
        }

        transaction.Commit();
        return message;
    }

    private static void WriteAudit(SqliteCommand command, string action, string target, string? actor, string? reason, DateTimeOffset now)
    {
        command.CommandText = "INSERT INTO chat_moderation_logs(action,target,actor,reason,created_at) VALUES($action,$target,$actor,$reason,$now);";
        command.Parameters.Clear();
        command.Parameters.AddWithValue("$action", action);
        command.Parameters.AddWithValue("$target", target);
        command.Parameters.AddWithValue("$actor", (object?)actor ?? DBNull.Value);
        command.Parameters.AddWithValue("$reason", (object?)reason ?? DBNull.Value);
        command.Parameters.AddWithValue("$now", Time(now));
        command.ExecuteNonQuery();
    }

    public ChatGuest? PublicGuest(string guestId)
    {
        using var connection = database.OpenConnection();
        using var command = Command(connection, "SELECT guest_id,nickname_snapshot,avatar_seed_snapshot FROM chat_messages WHERE guest_id=$guest" + (options.MessageCleanupEnabled ? " AND created_at >= $cutoff" : "") + " ORDER BY id DESC LIMIT 1", ("$guest", guestId));
        if (options.MessageCleanupEnabled) command.Parameters.AddWithValue("$cutoff", Time(DateTimeOffset.UtcNow.AddDays(-options.RetentionDays)));
        using var reader = command.ExecuteReader();
        return reader.Read() ? new(reader.GetString(0), reader.GetString(1), reader.GetString(2)) : null;
    }

    public ChatGuest[] RecentGuests()
    {
        using var connection = database.OpenConnection();
        using var command = Command(connection, "SELECT guest_id,nickname_snapshot,avatar_seed_snapshot FROM chat_messages WHERE deleted_at IS NULL" + (options.MessageCleanupEnabled ? " AND created_at >= $cutoff" : "") + " ORDER BY id DESC LIMIT 200");
        if (options.MessageCleanupEnabled) command.Parameters.AddWithValue("$cutoff", Time(DateTimeOffset.UtcNow.AddDays(-options.RetentionDays)));
        using var reader = command.ExecuteReader();
        var guests = new List<ChatGuest>();
        var seen = new HashSet<string>();
        while (reader.Read())
            if (seen.Add(reader.GetString(0)))
                guests.Add(new ChatGuest(reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        return [.. guests.Take(100)];
    }

    public ChatMessageContext? Context(long id)
    {
        var message = Message(id.ToString(CultureInfo.InvariantCulture));
        if (message is null || (options.MessageCleanupEnabled && message.CreatedAt < DateTimeOffset.UtcNow.AddDays(-options.RetentionDays))) return null;
        var neighborhood = Math.Max(1, options.HistoryPageSize / 2);
        var before = History(id, null, neighborhood);
        var after = History(null, id, neighborhood);
        return new ChatMessageContext([.. before.Items, message, .. after.Items], before.HasMore, after.HasMore);
    }

    public int Cleanup()
    {
        using var connection = database.OpenConnection();
        var total = 0;
        foreach (var (table, date, days) in new[]
                 {
                     ("chat_messages", "created_at", options.RetentionDays), ("chat_guest_sessions", "expires_at", 0),
                     ("chat_moderation_logs", "created_at", options.AuditRetentionDays)
                 })
        {
            if (table == "chat_messages" && !options.MessageCleanupEnabled) continue;
            using var command = Command(connection, $"DELETE FROM {table} WHERE rowid IN (SELECT rowid FROM {table} WHERE {date} < $cutoff LIMIT $batch)",
                ("$cutoff", Time(DateTimeOffset.UtcNow.AddDays(-days))), ("$batch", options.CleanupBatchSize));
            total += command.ExecuteNonQuery();
        }

        using var orphans = Command(connection, "DELETE FROM chat_message_replies WHERE message_id IN (SELECT r.message_id FROM chat_message_replies r LEFT JOIN chat_messages m ON m.id=r.message_id WHERE m.id IS NULL LIMIT $batch)", ("$batch", options.CleanupBatchSize));
        total += orphans.ExecuteNonQuery();
        using var mentions = Command(connection, "DELETE FROM chat_message_mentions WHERE rowid IN (SELECT t.rowid FROM chat_message_mentions t LEFT JOIN chat_messages m ON m.id=t.message_id WHERE m.id IS NULL LIMIT $batch)", ("$batch", options.CleanupBatchSize));
        return total + mentions.ExecuteNonQuery();
    }
}