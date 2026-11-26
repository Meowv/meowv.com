using System.Data;
using System.Globalization;
using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioAccountStore(StudioDatabase database) : IStudioStore
{
    private const string UserColumns = "id, username, username_lower, email, password_hash, role, email_verified, email_verified_at, avatar_path, created_at, updated_at, revision";

    public Task<StudioUser?> FindUserByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        return FindUserAsync("SELECT " + UserColumns + " FROM studio_users WHERE id = $id", ("$id", id.ToString("D")), cancellationToken);
    }

    public Task<StudioUser?> FindUserByEmailAsync(string email, CancellationToken cancellationToken)
    {
        return FindUserAsync("SELECT " + UserColumns + " FROM studio_users WHERE email = $email", ("$email", email), cancellationToken);
    }

    public Task<StudioUser?> FindUserByIdentifierAsync(string identifier, CancellationToken cancellationToken)
    {
        var trimmed = identifier.Trim();
        return trimmed.Contains('@', StringComparison.Ordinal) ? FindUserByEmailAsync(trimmed.ToLowerInvariant(), cancellationToken) : FindUserAsync("SELECT " + UserColumns + " FROM studio_users WHERE username_lower = $name", ("$name", trimmed.ToLowerInvariant()), cancellationToken);
    }

    public async Task<bool> UsernameExistsAsync(string username, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM studio_users WHERE username_lower = $name LIMIT 1;";
        command.Parameters.AddWithValue("$name", username.ToLowerInvariant());
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    public async Task<bool> EmailExistsAsync(string email, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM studio_users WHERE email = $email LIMIT 1;";
        command.Parameters.AddWithValue("$email", email);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    public async Task<bool> UserExistsAsync(Guid id, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM studio_users WHERE id = $id LIMIT 1;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    public async Task<int> CountUsersAsync(CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM studio_users;";
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
    }

    public async Task<int> CountUsableAdminsAsync(Guid? excludeUserId, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = excludeUserId is null
            ? "SELECT COUNT(*) FROM studio_users WHERE role = 'Admin' AND email_verified = 1;"
            : "SELECT COUNT(*) FROM studio_users WHERE role = 'Admin' AND email_verified = 1 AND id <> $exclude;";
        if (excludeUserId is not null) command.Parameters.AddWithValue("$exclude", excludeUserId.Value.ToString("D"));
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
    }

    public async Task AddUserAsync(StudioUser user, StudioEmailToken? token, StudioOutboxMessage? outbox, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

        try
        {
            await using (var command = connection.CreateCommand())
            {
                command.Transaction = (SqliteTransaction)transaction;
                command.CommandText = """
                                      INSERT INTO studio_users
                                          (id, username, username_lower, email, password_hash, role, email_verified,
                                           email_verified_at, avatar_path, created_at, updated_at, revision)
                                      VALUES ($id, $username, $usernameLower, $email, $passwordHash, $role, $verified,
                                              $verifiedAt, $avatar, $createdAt, $updatedAt, $revision);
                                      """;
                AddUserParameters(command, user);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            if (token is not null) await InsertEmailTokenAsync(connection, (SqliteTransaction)transaction, token, cancellationToken);
            if (outbox is not null) await InsertOutboxAsync(connection, (SqliteTransaction)transaction, outbox, cancellationToken);

            await transaction.CommitAsync(cancellationToken);
        }
        catch (SqliteException ex) when (ex.SqliteErrorCode == 19)
        {
            await transaction.RollbackAsync(cancellationToken);
            throw new StudioConflictException("用户名或邮箱已被占用。");
        }
    }

    public async Task UpdateUserAsync(StudioUser user, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = """
                              UPDATE studio_users
                                 SET username=$username, username_lower=$usernameLower, email=$email, password_hash=$passwordHash,
                                     role=$role, email_verified=$verified, email_verified_at=$verifiedAt, avatar_path=$avatar,
                                     created_at=$createdAt, updated_at=$updatedAt, revision=$revision
                               WHERE id=$id;
                              """;
        AddUserParameters(command, user);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task UpdateProfileAsync(StudioUser user, StudioEmailToken? token, StudioOutboxMessage? outbox, bool invalidateVerificationTokens, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = """
                                  UPDATE studio_users
                                     SET username=$username, username_lower=$usernameLower, email=$email, password_hash=$passwordHash,
                                         role=$role, email_verified=$verified, email_verified_at=$verifiedAt, avatar_path=$avatar,
                                         created_at=$createdAt, updated_at=$updatedAt, revision=$revision
                                   WHERE id=$id;
                                  """;
            AddUserParameters(command, user);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        if (invalidateVerificationTokens)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "UPDATE studio_email_tokens SET used_at=$now WHERE user_id=$userId AND purpose='VerifyEmail' AND used_at IS NULL;";
            command.Parameters.AddWithValue("$now", Ts(user.UpdatedAt));
            command.Parameters.AddWithValue("$userId", user.Id.ToString("D"));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        if (token is not null) await InsertEmailTokenAsync(connection, (SqliteTransaction)transaction, token, cancellationToken);
        if (outbox is not null) await InsertOutboxAsync(connection, (SqliteTransaction)transaction, outbox, cancellationToken);

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task DeleteUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM studio_users WHERE id=$id;";
        command.Parameters.AddWithValue("$id", userId.ToString("D"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<List<StudioAdminUserRow>> ListUsersAsync(CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT u.id, u.username, u.email, u.role, u.email_verified, u.created_at, u.revision,
                                     (SELECT COUNT(*) FROM studio_sessions s WHERE s.user_id = u.id)
                                FROM studio_users u
                               ORDER BY u.created_at;
                              """;

        var rows = new List<StudioAdminUserRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new StudioAdminUserRow
            {
                Id = Guid.Parse(reader.GetString(0)),
                Username = reader.GetString(1),
                Email = reader.GetString(2),
                Role = ParseRole(reader.GetString(3)),
                EmailVerified = reader.GetInt64(4) != 0,
                CreatedAt = ParseTime(reader.GetString(5)),
                Revision = reader.GetInt64(6),
                SessionCount = reader.GetInt32(7)
            });

        return rows;
    }

    public async Task<bool> SetRoleAsync(Guid userId, StudioUserRole role, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE studio_users SET role=$role, updated_at=$now, revision=revision+1 WHERE id=$id;";
        command.Parameters.AddWithValue("$role", role.ToString());
        command.Parameters.AddWithValue("$now", Ts(now));
        command.Parameters.AddWithValue("$id", userId.ToString("D"));
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    public async Task<StudioSessionContext?> FindActiveSessionAsync(string tokenId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT s.id, s.user_id, s.token_id, s.created_at, s.expires_at, s.revoked_at, s.user_agent,
                                     u.id, u.username, u.username_lower, u.email, u.password_hash, u.role, u.email_verified,
                                     u.email_verified_at, u.avatar_path, u.created_at, u.updated_at, u.revision
                                FROM studio_sessions s
                                JOIN studio_users u ON u.id = s.user_id
                               WHERE s.token_id=$tokenId AND s.revoked_at IS NULL AND s.expires_at > $now
                               LIMIT 1;
                              """;
        command.Parameters.AddWithValue("$tokenId", tokenId);
        command.Parameters.AddWithValue("$now", Ts(now));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new StudioSessionContext
        {
            Session = new StudioSession
            {
                Id = Guid.Parse(reader.GetString(0)),
                UserId = Guid.Parse(reader.GetString(1)),
                TokenId = reader.GetString(2),
                CreatedAt = ParseTime(reader.GetString(3)),
                ExpiresAt = ParseTime(reader.GetString(4)),
                RevokedAt = reader.IsDBNull(5) ? null : ParseTime(reader.GetString(5)),
                UserAgent = reader.IsDBNull(6) ? null : reader.GetString(6)
            },
            User = ReadUser(reader, 7)
        };
    }

    public async Task AddSessionAsync(StudioSession session, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = """
                              INSERT INTO studio_sessions (id, user_id, token_id, created_at, expires_at, revoked_at, user_agent)
                              VALUES ($id, $userId, $tokenId, $createdAt, $expiresAt, NULL, $userAgent);
                              """;
        command.Parameters.AddWithValue("$id", session.Id.ToString("D"));
        command.Parameters.AddWithValue("$userId", session.UserId.ToString("D"));
        command.Parameters.AddWithValue("$tokenId", session.TokenId);
        command.Parameters.AddWithValue("$createdAt", Ts(session.CreatedAt));
        command.Parameters.AddWithValue("$expiresAt", Ts(session.ExpiresAt));
        command.Parameters.AddWithValue("$userAgent", (object?)session.UserAgent ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task RevokeSessionAsync(string tokenId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE studio_sessions SET revoked_at=COALESCE(revoked_at, $now) WHERE token_id=$tokenId;";
        command.Parameters.AddWithValue("$now", Ts(now));
        command.Parameters.AddWithValue("$tokenId", tokenId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<int> RevokeAllSessionsAsync(Guid userId, DateTimeOffset now, string? exceptTokenId, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = string.IsNullOrEmpty(exceptTokenId)
            ? "UPDATE studio_sessions SET revoked_at=$now WHERE user_id=$userId AND revoked_at IS NULL AND expires_at > $now;"
            : "UPDATE studio_sessions SET revoked_at=$now WHERE user_id=$userId AND revoked_at IS NULL AND expires_at > $now AND token_id <> $except;";
        command.Parameters.AddWithValue("$now", Ts(now));
        command.Parameters.AddWithValue("$userId", userId.ToString("D"));
        if (!string.IsNullOrEmpty(exceptTokenId)) command.Parameters.AddWithValue("$except", exceptTokenId);
        return await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public Task<List<StudioSession>> ListActiveSessionsAsync(Guid userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        return ListSessionsCoreAsync(userId, now, true, cancellationToken);
    }

    public Task<List<StudioSession>> ListSessionsAsync(Guid userId, CancellationToken cancellationToken)
    {
        return ListSessionsCoreAsync(userId, null, false, cancellationToken);
    }

    public async Task<StudioEmailToken?> FindEmailTokenAsync(StudioEmailTokenPurpose purpose, string tokenHash, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT id, user_id, purpose, token_hash, created_at, expires_at, used_at
                                FROM studio_email_tokens
                               WHERE purpose=$purpose AND token_hash=$hash
                               LIMIT 1;
                              """;
        command.Parameters.AddWithValue("$purpose", purpose.ToString());
        command.Parameters.AddWithValue("$hash", tokenHash);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new StudioEmailToken
        {
            Id = Guid.Parse(reader.GetString(0)),
            UserId = Guid.Parse(reader.GetString(1)),
            Purpose = Enum.Parse<StudioEmailTokenPurpose>(reader.GetString(2)),
            TokenHash = reader.GetString(3),
            CreatedAt = ParseTime(reader.GetString(4)),
            ExpiresAt = ParseTime(reader.GetString(5)),
            UsedAt = reader.IsDBNull(6) ? null : ParseTime(reader.GetString(6))
        };
    }

    public async Task IssueEmailTokenAsync(StudioEmailToken token, StudioOutboxMessage outbox, bool invalidateExisting, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

        if (invalidateExisting)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "UPDATE studio_email_tokens SET used_at=$now WHERE user_id=$userId AND purpose=$purpose AND used_at IS NULL;";
            command.Parameters.AddWithValue("$now", Ts(token.CreatedAt));
            command.Parameters.AddWithValue("$userId", token.UserId.ToString("D"));
            command.Parameters.AddWithValue("$purpose", token.Purpose.ToString());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await InsertEmailTokenAsync(connection, (SqliteTransaction)transaction, token, cancellationToken);
        await InsertOutboxAsync(connection, (SqliteTransaction)transaction, outbox, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task MarkEmailVerifiedAsync(Guid tokenId, Guid userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "UPDATE studio_email_tokens SET used_at=$now WHERE id=$id AND used_at IS NULL;";
            command.Parameters.AddWithValue("$now", Ts(now));
            command.Parameters.AddWithValue("$id", tokenId.ToString("D"));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = """
                                  UPDATE studio_users
                                     SET email_verified=1, email_verified_at=$now, updated_at=$now, revision=revision+1
                                   WHERE id=$id;
                                  """;
            command.Parameters.AddWithValue("$now", Ts(now));
            command.Parameters.AddWithValue("$id", userId.ToString("D"));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task ResetPasswordAsync(Guid tokenId, Guid userId, string passwordHash, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "UPDATE studio_email_tokens SET used_at=$now WHERE id=$id AND used_at IS NULL;";
            command.Parameters.AddWithValue("$now", Ts(now));
            command.Parameters.AddWithValue("$id", tokenId.ToString("D"));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "UPDATE studio_users SET password_hash=$hash, updated_at=$now, revision=revision+1 WHERE id=$id;";
            command.Parameters.AddWithValue("$hash", passwordHash);
            command.Parameters.AddWithValue("$now", Ts(now));
            command.Parameters.AddWithValue("$id", userId.ToString("D"));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "UPDATE studio_sessions SET revoked_at=$now WHERE user_id=$userId AND revoked_at IS NULL;";
            command.Parameters.AddWithValue("$now", Ts(now));
            command.Parameters.AddWithValue("$userId", userId.ToString("D"));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task ChangePasswordAsync(Guid userId, string passwordHash, string currentTokenId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "UPDATE studio_users SET password_hash=$hash, updated_at=$now, revision=revision+1 WHERE id=$id;";
            command.Parameters.AddWithValue("$hash", passwordHash);
            command.Parameters.AddWithValue("$now", Ts(now));
            command.Parameters.AddWithValue("$id", userId.ToString("D"));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var command = connection.CreateCommand())
        {
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = """
                                  UPDATE studio_sessions SET revoked_at=$now
                                   WHERE user_id=$userId AND revoked_at IS NULL AND token_id <> $current;
                                  """;
            command.Parameters.AddWithValue("$now", Ts(now));
            command.Parameters.AddWithValue("$userId", userId.ToString("D"));
            command.Parameters.AddWithValue("$current", currentTokenId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<StudioPreferences?> GetPreferencesAsync(Guid userId, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT user_id, json, updated_at FROM studio_preferences WHERE user_id=$id;";
        command.Parameters.AddWithValue("$id", userId.ToString("D"));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new StudioPreferences
        {
            UserId = Guid.Parse(reader.GetString(0)),
            Json = reader.GetString(1),
            UpdatedAt = ParseTime(reader.GetString(2))
        };
    }

    public async Task UpsertPreferencesAsync(StudioPreferences preferences, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = """
                              INSERT INTO studio_preferences (user_id, json, updated_at)
                              VALUES ($id, $json, $updatedAt)
                              ON CONFLICT(user_id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at;
                              """;
        command.Parameters.AddWithValue("$id", preferences.UserId.ToString("D"));
        command.Parameters.AddWithValue("$json", preferences.Json);
        command.Parameters.AddWithValue("$updatedAt", Ts(preferences.UpdatedAt));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<StudioLayout?> GetLayoutAsync(Guid userId, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT user_id, json, revision, updated_at FROM studio_layouts WHERE user_id=$id;";
        command.Parameters.AddWithValue("$id", userId.ToString("D"));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new StudioLayout
        {
            UserId = Guid.Parse(reader.GetString(0)),
            Json = reader.GetString(1),
            Revision = reader.GetInt64(2),
            UpdatedAt = ParseTime(reader.GetString(3))
        };
    }

    public async Task<StudioLayoutPutResult> PutLayoutAsync(Guid userId, string json, long expectedRevision, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var transaction = connection.BeginTransaction(IsolationLevel.Serializable, false);

        var current = await ReadLayoutAsync(connection, transaction, userId, cancellationToken);
        var currentRevision = current?.Revision ?? 0;

        if (currentRevision != expectedRevision)
        {
            transaction.Rollback();
            return new StudioLayoutPutResult { Status = StudioLayoutPutStatus.Conflict, Current = current };
        }

        var newRevision = currentRevision + 1;

        if (current is null)
        {
            try
            {
                await using var insert = connection.CreateCommand();
                insert.Transaction = transaction;
                insert.CommandText = "INSERT INTO studio_layouts (user_id, json, revision, updated_at) VALUES ($id, $json, 1, $now);";
                insert.Parameters.AddWithValue("$id", userId.ToString("D"));
                insert.Parameters.AddWithValue("$json", json);
                insert.Parameters.AddWithValue("$now", Ts(now));
                await insert.ExecuteNonQueryAsync(cancellationToken);
            }
            catch (SqliteException ex) when (ex.SqliteErrorCode == 19)
            {
                transaction.Rollback();
                var latest = await ReadLayoutAsync(connection, null, userId, cancellationToken);
                return new StudioLayoutPutResult { Status = StudioLayoutPutStatus.Conflict, Current = latest };
            }
        }
        else
        {
            await using var update = connection.CreateCommand();
            update.Transaction = transaction;
            update.CommandText = """
                                 UPDATE studio_layouts SET json=$json, revision=$revision, updated_at=$now
                                  WHERE user_id=$id AND revision=$expected;
                                 """;
            update.Parameters.AddWithValue("$json", json);
            update.Parameters.AddWithValue("$revision", newRevision);
            update.Parameters.AddWithValue("$now", Ts(now));
            update.Parameters.AddWithValue("$id", userId.ToString("D"));
            update.Parameters.AddWithValue("$expected", currentRevision);
            if (await update.ExecuteNonQueryAsync(cancellationToken) == 0)
            {
                transaction.Rollback();
                var latest = await ReadLayoutAsync(connection, null, userId, cancellationToken);
                return new StudioLayoutPutResult { Status = StudioLayoutPutStatus.Conflict, Current = latest };
            }
        }

        transaction.Commit();
        return new StudioLayoutPutResult
        {
            Status = StudioLayoutPutStatus.Saved,
            Current = new StudioLayout { UserId = userId, Json = json, Revision = newRevision, UpdatedAt = now }
        };
    }

    public async Task<List<StudioOutboxMessage>> GetPendingEmailsAsync(DateTimeOffset now, int limit, int maxAttempts, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = """
                              SELECT id, user_id, purpose, recipient, subject, html_body, created_at, attempts, next_attempt_at, sent_at, last_error
                                FROM studio_email_outbox
                               WHERE sent_at IS NULL AND attempts < $maxAttempts AND next_attempt_at <= $now
                               ORDER BY next_attempt_at
                               LIMIT $limit;
                              """;
        command.Parameters.AddWithValue("$now", Ts(now));
        command.Parameters.AddWithValue("$limit", limit);
        command.Parameters.AddWithValue("$maxAttempts", Math.Max(1, maxAttempts));

        var rows = new List<StudioOutboxMessage>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new StudioOutboxMessage
            {
                Id = Guid.Parse(reader.GetString(0)),
                UserId = Guid.Parse(reader.GetString(1)),
                Purpose = Enum.Parse<StudioEmailTokenPurpose>(reader.GetString(2)),
                Recipient = reader.GetString(3),
                Subject = reader.GetString(4),
                HtmlBody = reader.GetString(5),
                CreatedAt = ParseTime(reader.GetString(6)),
                Attempts = reader.GetInt32(7),
                NextAttemptAt = ParseTime(reader.GetString(8)),
                SentAt = reader.IsDBNull(9) ? null : ParseTime(reader.GetString(9)),
                LastError = reader.IsDBNull(10) ? null : reader.GetString(10)
            });

        return rows;
    }

    public async Task DeleteOutboxAsync(Guid id, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM studio_email_outbox WHERE id=$id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task RecordOutboxFailureAsync(Guid id, int attempts, DateTimeOffset nextAttemptAt, string error, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE studio_email_outbox SET attempts=$attempts, next_attempt_at=$next, last_error=$error WHERE id=$id;";
        command.Parameters.AddWithValue("$attempts", attempts);
        command.Parameters.AddWithValue("$next", Ts(nextAttemptAt));
        command.Parameters.AddWithValue("$error", error);
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<StudioAdminStats> GetStatsAsync(DateTimeOffset now, long databaseBytes, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();

        return new StudioAdminStats
        {
            UserCount = await CountAsync("SELECT COUNT(*) FROM studio_users;", connection, now, cancellationToken),
            AdminCount = await CountAsync("SELECT COUNT(*) FROM studio_users WHERE role='Admin' AND email_verified=1;", connection, now, cancellationToken),
            VerifiedCount = await CountAsync("SELECT COUNT(*) FROM studio_users WHERE email_verified=1;", connection, now, cancellationToken),
            ActiveSessionCount = await CountAsync("SELECT COUNT(*) FROM studio_sessions WHERE revoked_at IS NULL AND expires_at > $now;", connection, now, cancellationToken),
            SessionCount = await CountAsync("SELECT COUNT(*) FROM studio_sessions;", connection, now, cancellationToken),
            LayoutCount = await CountAsync("SELECT COUNT(*) FROM studio_layouts;", connection, now, cancellationToken),
            PreferenceCount = await CountAsync("SELECT COUNT(*) FROM studio_preferences;", connection, now, cancellationToken),
            DatabaseBytes = databaseBytes
        };
    }

    private static async Task<int> CountAsync(string sql, SqliteConnection connection, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("$now", Ts(now));
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
    }

    private async Task<StudioUser?> FindUserAsync(string sql, (string Name, object Value) parameter, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue(parameter.Name, parameter.Value);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadUser(reader, 0) : null;
    }

    private async Task<List<StudioSession>> ListSessionsCoreAsync(Guid userId, DateTimeOffset? now, bool activeOnly, CancellationToken cancellationToken)
    {
        await using var connection = database.OpenConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = activeOnly
            ? """
              SELECT id, user_id, token_id, created_at, expires_at, revoked_at, user_agent
                FROM studio_sessions
               WHERE user_id=$id AND revoked_at IS NULL AND expires_at > $now
               ORDER BY created_at DESC;
              """
            : """
              SELECT id, user_id, token_id, created_at, expires_at, revoked_at, user_agent
                FROM studio_sessions
               WHERE user_id=$id
               ORDER BY created_at DESC;
              """;
        command.Parameters.AddWithValue("$id", userId.ToString("D"));
        if (now is not null) command.Parameters.AddWithValue("$now", Ts(now.Value));

        var rows = new List<StudioSession>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new StudioSession
            {
                Id = Guid.Parse(reader.GetString(0)),
                UserId = Guid.Parse(reader.GetString(1)),
                TokenId = reader.GetString(2),
                CreatedAt = ParseTime(reader.GetString(3)),
                ExpiresAt = ParseTime(reader.GetString(4)),
                RevokedAt = reader.IsDBNull(5) ? null : ParseTime(reader.GetString(5)),
                UserAgent = reader.IsDBNull(6) ? null : reader.GetString(6)
            });

        return rows;
    }

    private static StudioUser ReadUser(SqliteDataReader reader, int offset)
    {
        return new StudioUser
        {
            Id = Guid.Parse(reader.GetString(offset)),
            Username = reader.GetString(offset + 1),
            UsernameLower = reader.GetString(offset + 2),
            Email = reader.GetString(offset + 3),
            PasswordHash = reader.GetString(offset + 4),
            Role = ParseRole(reader.GetString(offset + 5)),
            EmailVerified = reader.GetInt64(offset + 6) != 0,
            EmailVerifiedAt = reader.IsDBNull(offset + 7) ? null : ParseTime(reader.GetString(offset + 7)),
            AvatarPath = reader.IsDBNull(offset + 8) ? null : reader.GetString(offset + 8),
            CreatedAt = ParseTime(reader.GetString(offset + 9)),
            UpdatedAt = ParseTime(reader.GetString(offset + 10)),
            Revision = reader.GetInt64(offset + 11)
        };
    }

    private static void AddUserParameters(SqliteCommand command, StudioUser user)
    {
        command.Parameters.AddWithValue("$id", user.Id.ToString("D"));
        command.Parameters.AddWithValue("$username", user.Username);
        command.Parameters.AddWithValue("$usernameLower", user.UsernameLower);
        command.Parameters.AddWithValue("$email", user.Email);
        command.Parameters.AddWithValue("$passwordHash", user.PasswordHash);
        command.Parameters.AddWithValue("$role", user.Role.ToString());
        command.Parameters.AddWithValue("$verified", user.EmailVerified ? 1 : 0);
        command.Parameters.AddWithValue("$verifiedAt", user.EmailVerifiedAt is null ? DBNull.Value : Ts(user.EmailVerifiedAt.Value));
        command.Parameters.AddWithValue("$avatar", (object?)user.AvatarPath ?? DBNull.Value);
        command.Parameters.AddWithValue("$createdAt", Ts(user.CreatedAt));
        command.Parameters.AddWithValue("$updatedAt", Ts(user.UpdatedAt));
        command.Parameters.AddWithValue("$revision", user.Revision);
    }

    private static async Task InsertEmailTokenAsync(SqliteConnection connection, SqliteTransaction transaction, StudioEmailToken token, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
                              INSERT INTO studio_email_tokens (id, user_id, purpose, token_hash, created_at, expires_at, used_at)
                              VALUES ($id, $userId, $purpose, $hash, $createdAt, $expiresAt, $usedAt);
                              """;
        command.Parameters.AddWithValue("$id", token.Id.ToString("D"));
        command.Parameters.AddWithValue("$userId", token.UserId.ToString("D"));
        command.Parameters.AddWithValue("$purpose", token.Purpose.ToString());
        command.Parameters.AddWithValue("$hash", token.TokenHash);
        command.Parameters.AddWithValue("$createdAt", Ts(token.CreatedAt));
        command.Parameters.AddWithValue("$expiresAt", Ts(token.ExpiresAt));
        command.Parameters.AddWithValue("$usedAt", token.UsedAt is null ? DBNull.Value : Ts(token.UsedAt.Value));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task InsertOutboxAsync(SqliteConnection connection, SqliteTransaction transaction, StudioOutboxMessage message, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
                              INSERT INTO studio_email_outbox
                                  (id, user_id, purpose, recipient, subject, html_body, created_at, attempts, next_attempt_at, sent_at, last_error)
                              VALUES ($id, $userId, $purpose, $recipient, $subject, $body, $createdAt, $attempts, $next, $sentAt, $error);
                              """;
        command.Parameters.AddWithValue("$id", message.Id.ToString("D"));
        command.Parameters.AddWithValue("$userId", message.UserId.ToString("D"));
        command.Parameters.AddWithValue("$purpose", message.Purpose.ToString());
        command.Parameters.AddWithValue("$recipient", message.Recipient);
        command.Parameters.AddWithValue("$subject", message.Subject);
        command.Parameters.AddWithValue("$body", message.HtmlBody);
        command.Parameters.AddWithValue("$createdAt", Ts(message.CreatedAt));
        command.Parameters.AddWithValue("$attempts", message.Attempts);
        command.Parameters.AddWithValue("$next", Ts(message.NextAttemptAt));
        command.Parameters.AddWithValue("$sentAt", message.SentAt is null ? DBNull.Value : Ts(message.SentAt.Value));
        command.Parameters.AddWithValue("$error", (object?)message.LastError ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<StudioLayout?> ReadLayoutAsync(SqliteConnection connection, SqliteTransaction? transaction, Guid userId, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT user_id, json, revision, updated_at FROM studio_layouts WHERE user_id=$id;";
        command.Parameters.AddWithValue("$id", userId.ToString("D"));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new StudioLayout
        {
            UserId = Guid.Parse(reader.GetString(0)),
            Json = reader.GetString(1),
            Revision = reader.GetInt64(2),
            UpdatedAt = ParseTime(reader.GetString(3))
        };
    }

    private static StudioUserRole ParseRole(string value)
    {
        return Enum.TryParse<StudioUserRole>(value, true, out var role) ? role : StudioUserRole.User;
    }

    private static string Ts(DateTimeOffset value)
    {
        return value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
    }

    private static DateTimeOffset ParseTime(string value)
    {
        return DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
    }
}