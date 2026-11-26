namespace Meowv.Api.Modules.Studio.Application;

public sealed partial class StudioAdminService(
    IStudioStore store,
    IStudioPasswordHasher hasher,
    IStudioClock clock,
    ILogger<StudioAdminService> logger)
{
    public async Task<StudioAccountResult<List<StudioAdminUserRow>>> ListUsersAsync(CancellationToken cancellationToken)
    {
        return StudioAccountResult<List<StudioAdminUserRow>>.Success(await store.ListUsersAsync(cancellationToken));
    }

    public async Task<StudioAccountResult<StudioUser>> SetRoleAsync(
        Guid actorId,
        Guid targetId,
        string roleInput,
        CancellationToken cancellationToken)
    {
        var role = StudioAccountRules.ParseRole(roleInput);
        if (role is null) return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.Validation, "未知角色。");

        var target = await store.FindUserByIdAsync(targetId, cancellationToken);
        if (target is null) return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.NotFound, "用户不存在。");

        if (target.Role == StudioUserRole.Admin && role != StudioUserRole.Admin &&
            await store.CountUsableAdminsAsync(targetId, cancellationToken) == 0)
            return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.LastAdmin, "不能降级最后一个管理员。");

        await store.SetRoleAsync(targetId, role.Value, clock.UtcNow, cancellationToken);

        if (target.Role != role.Value)
        {
            await store.RevokeAllSessionsAsync(targetId, clock.UtcNow, null, cancellationToken);
            LogRoleChanged(actorId, targetId, target.Role.ToString(), role.Value.ToString());
        }

        var updated = await store.FindUserByIdAsync(targetId, cancellationToken);
        return updated is null
            ? StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.NotFound, "用户不存在。")
            : StudioAccountResult<StudioUser>.Success(updated);
    }

    public async Task<StudioAccountResult<bool>> DeleteUserAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken)
    {
        if (actorId == targetId)
            return StudioAccountResult<bool>.Failure(StudioErrorCodes.SelfDelete, "不能注销当前登录的管理员。");

        var target = await store.FindUserByIdAsync(targetId, cancellationToken);
        if (target is null) return StudioAccountResult<bool>.Failure(StudioErrorCodes.NotFound, "用户不存在。");

        if (target.Role == StudioUserRole.Admin && await store.CountUsableAdminsAsync(targetId, cancellationToken) == 0)
            return StudioAccountResult<bool>.Failure(StudioErrorCodes.LastAdmin, "不能删除最后一个管理员。");

        await store.DeleteUserAsync(targetId, cancellationToken);
        LogUserDeleted(actorId, targetId);
        return StudioAccountResult<bool>.Success(true);
    }

    public async Task<StudioAccountResult<List<StudioSession>>> ListSessionsAsync(
        Guid targetId,
        bool activeOnly,
        CancellationToken cancellationToken)
    {
        if (!await store.UserExistsAsync(targetId, cancellationToken))
            return StudioAccountResult<List<StudioSession>>.Failure(StudioErrorCodes.NotFound, "用户不存在。");

        var sessions = activeOnly
            ? await store.ListActiveSessionsAsync(targetId, clock.UtcNow, cancellationToken)
            : await store.ListSessionsAsync(targetId, cancellationToken);
        return StudioAccountResult<List<StudioSession>>.Success(sessions);
    }

    public async Task<StudioAccountResult<int>> RevokeSessionsAsync(
        Guid actorId,
        Guid targetId,
        string? exceptTokenId,
        CancellationToken cancellationToken)
    {
        if (!await store.UserExistsAsync(targetId, cancellationToken))
            return StudioAccountResult<int>.Failure(StudioErrorCodes.NotFound, "用户不存在。");

        var revoked = await store.RevokeAllSessionsAsync(targetId, clock.UtcNow, exceptTokenId, cancellationToken);
        LogSessionsRevoked(actorId, targetId, revoked);
        return StudioAccountResult<int>.Success(revoked);
    }

    public async Task<StudioAdminStats> GetStatsAsync(long databaseBytes, CancellationToken cancellationToken)
    {
        return await store.GetStatsAsync(clock.UtcNow, databaseBytes, cancellationToken);
    }

    public async Task<StudioAccountResult<StudioUser>> CreateFirstAdminAsync(
        string usernameInput,
        string emailInput,
        string password,
        CancellationToken cancellationToken)
    {
        if (await store.CountUsableAdminsAsync(null, cancellationToken) > 0)
            return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.Conflict, "管理员已存在，请直接登录。");

        var username = StudioAccountRules.NormaliseUsername(usernameInput);
        var email = StudioAccountRules.NormaliseEmail(emailInput);
        var validation = StudioAccountRules.ValidateUsername(username)
                         ?? StudioAccountRules.ValidateEmail(email)
                         ?? StudioAccountRules.ValidatePassword(password, StudioAccountRules.AdminPasswordMinLength);
        if (validation is not null) return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.Validation, validation);

        if (await store.EmailExistsAsync(email, cancellationToken) || await store.UsernameExistsAsync(username, cancellationToken))
            return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.Conflict, "用户名或邮箱已被占用。");

        var now = clock.UtcNow;
        var user = new StudioUser
        {
            Username = username,
            UsernameLower = username.ToLowerInvariant(),
            Email = email,
            PasswordHash = hasher.Hash(password),
            Role = StudioUserRole.Admin,
            EmailVerified = true,
            EmailVerifiedAt = now,
            CreatedAt = now,
            UpdatedAt = now
        };

        try
        {
            await store.AddUserAsync(user, null, null, cancellationToken);
        }
        catch (StudioConflictException)
        {
            return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.Conflict, "用户名或邮箱已被占用。");
        }

        LogFirstAdminCreated(user.Id);
        return StudioAccountResult<StudioUser>.Success(user);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Admin {ActorId} changed role of {TargetId}: {From} -> {To}")]
    private partial void LogRoleChanged(Guid actorId, Guid targetId, string from, string to);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Admin {ActorId} deleted user {TargetId}")]
    private partial void LogUserDeleted(Guid actorId, Guid targetId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Admin {ActorId} revoked {Count} sessions for {TargetId}")]
    private partial void LogSessionsRevoked(Guid actorId, Guid targetId, int count);

    [LoggerMessage(Level = LogLevel.Information, Message = "Created first Studio administrator {UserId}")]
    private partial void LogFirstAdminCreated(Guid userId);
}