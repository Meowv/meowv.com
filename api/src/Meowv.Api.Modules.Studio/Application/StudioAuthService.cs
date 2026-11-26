using System.Net;

namespace Meowv.Api.Modules.Studio.Application;

public sealed class StudioAuthService(
    IStudioStore store,
    IStudioPasswordHasher hasher,
    IStudioTokenService tokens,
    IStudioEmailSender email,
    IStudioOneTimeTokenService oneTimeTokens,
    IStudioAttemptLimiter limiter,
    IStudioClock clock,
    StudioOptions options)
{
    public async Task<StudioAccountResult<StudioRegisterOutcome>> RegisterAsync(
        string usernameInput,
        string emailInput,
        string password,
        string? userAgent,
        CancellationToken cancellationToken)
    {
        if (!options.RegistrationEnabled)
            return StudioAccountResult<StudioRegisterOutcome>.Failure(StudioErrorCodes.RegistrationDisabled, "当前未开放注册。");

        var username = StudioAccountRules.NormaliseUsername(usernameInput);
        var emailAddress = StudioAccountRules.NormaliseEmail(emailInput);
        var validation = StudioAccountRules.ValidateUsername(username)
                         ?? StudioAccountRules.ValidateEmail(emailAddress)
                         ?? StudioAccountRules.ValidatePassword(password);
        if (validation is not null)
            return StudioAccountResult<StudioRegisterOutcome>.Failure(StudioErrorCodes.Validation, validation);

        if (options.RequireEmailVerification && !email.IsConfigured)
            return StudioAccountResult<StudioRegisterOutcome>.Failure(StudioErrorCodes.EmailNotConfigured, "服务器未配置邮件发送，暂时无法完成注册。请联系管理员。");

        if (await store.EmailExistsAsync(emailAddress, cancellationToken) ||
            await store.UsernameExistsAsync(username, cancellationToken))
            return StudioAccountResult<StudioRegisterOutcome>.Failure(StudioErrorCodes.Conflict, "用户名或邮箱已被占用。");

        var now = clock.UtcNow;
        var user = new StudioUser
        {
            Username = username,
            UsernameLower = username.ToLowerInvariant(),
            Email = emailAddress,
            PasswordHash = hasher.Hash(password),
            Role = StudioUserRole.User,
            EmailVerified = !options.RequireEmailVerification,
            EmailVerifiedAt = options.RequireEmailVerification ? null : now,
            CreatedAt = now,
            UpdatedAt = now
        };

        StudioEmailToken? token = null;
        StudioOutboxMessage? outbox = null;
        if (options.RequireEmailVerification)
        {
            var plaintext = oneTimeTokens.CreateToken();
            token = NewEmailToken(user, StudioEmailTokenPurpose.VerifyEmail, plaintext, now);
            outbox = NewOutbox(user, StudioEmailTokenPurpose.VerifyEmail, plaintext, now);
        }

        try
        {
            await store.AddUserAsync(user, token, outbox, cancellationToken);
        }
        catch (StudioConflictException)
        {
            return StudioAccountResult<StudioRegisterOutcome>.Failure(StudioErrorCodes.Conflict, "用户名或邮箱已被占用。");
        }

        if (options.RequireEmailVerification)
            return StudioAccountResult<StudioRegisterOutcome>.Success(new StudioRegisterOutcome(true, null));

        var session = await CreateSessionAsync(user, now, userAgent, cancellationToken);
        return StudioAccountResult<StudioRegisterOutcome>.Success(new StudioRegisterOutcome(false, session));
    }

    public async Task<StudioAccountResult<StudioAuthSession>> LoginAsync(
        string identifier,
        string password,
        string clientKey,
        string? userAgent,
        CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var throttleKey = $"login:{clientKey}:{identifier.Trim().ToLowerInvariant()}";

        if (limiter.IsBlocked(throttleKey, now, out var retryAfter))
            return StudioAccountResult<StudioAuthSession>.Failure(
                StudioErrorCodes.Throttled,
                $"尝试次数过多，请在 {Math.Ceiling(retryAfter.TotalSeconds)} 秒后重试。");

        var trimmed = identifier.Trim();
        if (!StudioAccountRules.IsPlausibleIdentifier(trimmed) || string.IsNullOrEmpty(password))
        {
            limiter.RecordFailure(throttleKey, now);
            return StudioAccountResult<StudioAuthSession>.Failure(StudioErrorCodes.InvalidCredentials, "用户名或密码不正确。");
        }

        var user = await store.FindUserByIdentifierAsync(trimmed, cancellationToken);
        if (user is null)
        {
            limiter.RecordFailure(throttleKey, now);
            hasher.Verify(password, hasher.Hash("timing-equaliser"));
            return StudioAccountResult<StudioAuthSession>.Failure(StudioErrorCodes.InvalidCredentials, "用户名或密码不正确。");
        }

        var verification = hasher.Verify(password, user.PasswordHash);
        if (!verification.Success)
        {
            limiter.RecordFailure(throttleKey, now);
            return StudioAccountResult<StudioAuthSession>.Failure(StudioErrorCodes.InvalidCredentials, "用户名或密码不正确。");
        }

        if (options.RequireEmailVerification && !user.EmailVerified)
            return StudioAccountResult<StudioAuthSession>.Failure(StudioErrorCodes.EmailUnverified, "请先完成邮箱验证。");

        limiter.Reset(throttleKey);

        if (verification.NeedsRehash)
        {
            user.PasswordHash = hasher.Hash(password);
            user.UpdatedAt = now;
            user.Revision += 1;
            await store.UpdateUserAsync(user, cancellationToken);
        }

        return StudioAccountResult<StudioAuthSession>.Success(await CreateSessionAsync(user, now, userAgent, cancellationToken));
    }

    public async Task<StudioAccountResult<bool>> LogoutAsync(string tokenId, CancellationToken cancellationToken)
    {
        await store.RevokeSessionAsync(tokenId, clock.UtcNow, cancellationToken);
        return StudioAccountResult<bool>.Success(true);
    }

    public async Task<StudioAccountResult<StudioUser>> VerifyEmailAsync(string token, CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var record = await store.FindEmailTokenAsync(StudioEmailTokenPurpose.VerifyEmail, oneTimeTokens.Hash(token), cancellationToken);
        if (record is null || !record.IsUsable(now))
            return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.InvalidToken, "验证链接无效或已过期。");

        var user = await store.FindUserByIdAsync(record.UserId, cancellationToken);
        if (user is null)
            return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.InvalidToken, "验证链接无效或已过期。");

        await store.MarkEmailVerifiedAsync(record.Id, user.Id, now, cancellationToken);
        user.EmailVerified = true;
        user.EmailVerifiedAt = now;
        user.UpdatedAt = now;
        user.Revision += 1;
        return StudioAccountResult<StudioUser>.Success(user);
    }

    public async Task<StudioAccountResult<bool>> ResendVerificationAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await store.FindUserByIdAsync(userId, cancellationToken);
        if (user is null) return StudioAccountResult<bool>.Failure(StudioErrorCodes.NotFound, "账号不存在。");
        if (user.EmailVerified) return StudioAccountResult<bool>.Failure(StudioErrorCodes.Conflict, "邮箱已验证。");
        if (!email.IsConfigured) return StudioAccountResult<bool>.Failure(StudioErrorCodes.EmailNotConfigured, "服务器未配置邮件发送。");

        var now = clock.UtcNow;
        var plaintext = oneTimeTokens.CreateToken();
        var token = NewEmailToken(user, StudioEmailTokenPurpose.VerifyEmail, plaintext, now);
        var outbox = NewOutbox(user, StudioEmailTokenPurpose.VerifyEmail, plaintext, now);
        await store.IssueEmailTokenAsync(token, outbox, true, cancellationToken);
        return StudioAccountResult<bool>.Success(true);
    }

    public async Task<StudioAccountResult<bool>> ForgotPasswordAsync(string emailInput, CancellationToken cancellationToken)
    {
        if (!email.IsConfigured)
            return StudioAccountResult<bool>.Failure(StudioErrorCodes.EmailNotConfigured, "服务器未配置邮件发送，暂时无法找回密码。");

        var address = StudioAccountRules.NormaliseEmail(emailInput);
        if (StudioAccountRules.ValidateEmail(address) is not null)
            return StudioAccountResult<bool>.Success(true);

        var user = await store.FindUserByEmailAsync(address, cancellationToken);
        if (user is null) return StudioAccountResult<bool>.Success(true);

        var now = clock.UtcNow;
        var plaintext = oneTimeTokens.CreateToken();
        var token = NewEmailToken(user, StudioEmailTokenPurpose.ResetPassword, plaintext, now);
        var outbox = NewOutbox(user, StudioEmailTokenPurpose.ResetPassword, plaintext, now);
        await store.IssueEmailTokenAsync(token, outbox, true, cancellationToken);
        return StudioAccountResult<bool>.Success(true);
    }

    public async Task<StudioAccountResult<bool>> ResetPasswordAsync(string token, string newPassword, CancellationToken cancellationToken)
    {
        var validation = StudioAccountRules.ValidatePassword(newPassword);
        if (validation is not null) return StudioAccountResult<bool>.Failure(StudioErrorCodes.Validation, validation);

        var now = clock.UtcNow;
        var record = await store.FindEmailTokenAsync(StudioEmailTokenPurpose.ResetPassword, oneTimeTokens.Hash(token), cancellationToken);
        if (record is null || !record.IsUsable(now))
            return StudioAccountResult<bool>.Failure(StudioErrorCodes.InvalidToken, "重置链接无效或已过期。");

        await store.ResetPasswordAsync(record.Id, record.UserId, hasher.Hash(newPassword), now, cancellationToken);
        return StudioAccountResult<bool>.Success(true);
    }

    private async Task<StudioAuthSession> CreateSessionAsync(StudioUser user, DateTimeOffset now, string? userAgent, CancellationToken cancellationToken)
    {
        var issued = tokens.Issue(user, now);
        await store.AddSessionAsync(new StudioSession
        {
            UserId = user.Id,
            TokenId = issued.TokenId,
            CreatedAt = now,
            ExpiresAt = issued.ExpiresAt,
            UserAgent = TruncateUserAgent(userAgent)
        }, cancellationToken);

        return new StudioAuthSession { Token = issued.Token, ExpiresAt = issued.ExpiresAt, User = user };
    }

    private StudioEmailToken NewEmailToken(StudioUser user, StudioEmailTokenPurpose purpose, string plaintext, DateTimeOffset now)
    {
        var lifetime = purpose == StudioEmailTokenPurpose.VerifyEmail
            ? TimeSpan.FromHours(Math.Max(1, options.EmailVerifyHours))
            : TimeSpan.FromMinutes(Math.Max(1, options.PasswordResetMinutes));

        return new StudioEmailToken
        {
            UserId = user.Id,
            Purpose = purpose,
            TokenHash = oneTimeTokens.Hash(plaintext),
            CreatedAt = now,
            ExpiresAt = now + lifetime
        };
    }

    private StudioOutboxMessage NewOutbox(StudioUser user, StudioEmailTokenPurpose purpose, string plaintext, DateTimeOffset now)
    {
        var path = purpose == StudioEmailTokenPurpose.VerifyEmail ? "verify-email" : "reset-password";
        var baseUrl = string.IsNullOrWhiteSpace(options.PublicBaseUrl) ? "http://localhost:5000" : options.PublicBaseUrl.TrimEnd('/');
        var link = $"{baseUrl}/{path}?token={Uri.EscapeDataString(plaintext)}";

        if (purpose == StudioEmailTokenPurpose.VerifyEmail)
        {
            var body = $"""
                        <p>你好 {WebUtility.HtmlEncode(user.Username)}，</p>
                        <p>请点击下面的链接完成邮箱验证（{Math.Max(1, options.EmailVerifyHours)} 小时内有效）：</p>
                        <p><a href="{WebUtility.HtmlEncode(link)}">验证邮箱</a></p>
                        <p>如果这不是你本人的操作，请忽略这封邮件。</p>
                        """;

            return new StudioOutboxMessage
            {
                UserId = user.Id,
                Purpose = purpose,
                Recipient = user.Email,
                Subject = "验证你的 Studio 邮箱",
                HtmlBody = body,
                CreatedAt = now,
                NextAttemptAt = now
            };
        }

        var resetBody = $"""
                         <p>你好 {WebUtility.HtmlEncode(user.Username)}，</p>
                         <p>请点击下面的链接设置新密码（{Math.Max(1, options.PasswordResetMinutes)} 分钟内有效）：</p>
                         <p><a href="{WebUtility.HtmlEncode(link)}">重置密码</a></p>
                         <p>如果这不是你本人的操作，请忽略这封邮件，你的密码不会被修改。</p>
                         """;

        return new StudioOutboxMessage
        {
            UserId = user.Id,
            Purpose = purpose,
            Recipient = user.Email,
            Subject = "重置你的 Studio 密码",
            HtmlBody = resetBody,
            CreatedAt = now,
            NextAttemptAt = now
        };
    }

    private static string? TruncateUserAgent(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent)) return null;
        return userAgent.Length <= 200 ? userAgent : userAgent[..200];
    }
}