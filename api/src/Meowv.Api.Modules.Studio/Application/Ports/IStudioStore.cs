namespace Meowv.Api.Modules.Studio.Application.Ports;

public interface IStudioStore
{
    Task<StudioUser?> FindUserByIdAsync(Guid id, CancellationToken cancellationToken);

    Task<StudioUser?> FindUserByIdentifierAsync(string identifier, CancellationToken cancellationToken);

    Task<StudioUser?> FindUserByEmailAsync(string email, CancellationToken cancellationToken);

    Task<bool> UsernameExistsAsync(string username, CancellationToken cancellationToken);

    Task<bool> EmailExistsAsync(string email, CancellationToken cancellationToken);

    Task<bool> UserExistsAsync(Guid id, CancellationToken cancellationToken);

    Task<int> CountUsersAsync(CancellationToken cancellationToken);

    Task<int> CountUsableAdminsAsync(Guid? excludeUserId, CancellationToken cancellationToken);

    Task AddUserAsync(StudioUser user, StudioEmailToken? token, StudioOutboxMessage? outbox, CancellationToken cancellationToken);

    Task UpdateUserAsync(StudioUser user, CancellationToken cancellationToken);

    Task UpdateProfileAsync(StudioUser user, StudioEmailToken? token, StudioOutboxMessage? outbox, bool invalidateVerificationTokens, CancellationToken cancellationToken);

    Task DeleteUserAsync(Guid userId, CancellationToken cancellationToken);

    Task<List<StudioAdminUserRow>> ListUsersAsync(CancellationToken cancellationToken);

    Task<bool> SetRoleAsync(Guid userId, StudioUserRole role, DateTimeOffset now, CancellationToken cancellationToken);

    Task<StudioSessionContext?> FindActiveSessionAsync(string tokenId, DateTimeOffset now, CancellationToken cancellationToken);

    Task AddSessionAsync(StudioSession session, CancellationToken cancellationToken);

    Task RevokeSessionAsync(string tokenId, DateTimeOffset now, CancellationToken cancellationToken);

    Task<int> RevokeAllSessionsAsync(Guid userId, DateTimeOffset now, string? exceptTokenId, CancellationToken cancellationToken);

    Task<List<StudioSession>> ListActiveSessionsAsync(Guid userId, DateTimeOffset now, CancellationToken cancellationToken);

    Task<List<StudioSession>> ListSessionsAsync(Guid userId, CancellationToken cancellationToken);

    Task<StudioEmailToken?> FindEmailTokenAsync(StudioEmailTokenPurpose purpose, string tokenHash, CancellationToken cancellationToken);

    Task IssueEmailTokenAsync(StudioEmailToken token, StudioOutboxMessage outbox, bool invalidateExisting, CancellationToken cancellationToken);

    Task MarkEmailVerifiedAsync(Guid tokenId, Guid userId, DateTimeOffset now, CancellationToken cancellationToken);

    Task ResetPasswordAsync(Guid tokenId, Guid userId, string passwordHash, DateTimeOffset now, CancellationToken cancellationToken);

    Task ChangePasswordAsync(Guid userId, string passwordHash, string currentTokenId, DateTimeOffset now, CancellationToken cancellationToken);

    Task<StudioPreferences?> GetPreferencesAsync(Guid userId, CancellationToken cancellationToken);

    Task UpsertPreferencesAsync(StudioPreferences preferences, CancellationToken cancellationToken);

    Task<StudioLayout?> GetLayoutAsync(Guid userId, CancellationToken cancellationToken);

    Task<StudioLayoutPutResult> PutLayoutAsync(Guid userId, string json, long expectedRevision, DateTimeOffset now, CancellationToken cancellationToken);

    Task<List<StudioOutboxMessage>> GetPendingEmailsAsync(DateTimeOffset now, int limit, CancellationToken cancellationToken);

    Task DeleteOutboxAsync(Guid id, CancellationToken cancellationToken);

    Task RecordOutboxFailureAsync(Guid id, int attempts, DateTimeOffset nextAttemptAt, string error, CancellationToken cancellationToken);

    Task<StudioAdminStats> GetStatsAsync(DateTimeOffset now, long databaseBytes, CancellationToken cancellationToken);
}