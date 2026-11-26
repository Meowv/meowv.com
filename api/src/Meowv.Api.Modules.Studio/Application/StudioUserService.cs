using System.Buffers;
using System.Net;
using System.Text;
using System.Text.Json;

namespace Meowv.Api.Modules.Studio.Application;

public sealed class StudioUserService(
    IStudioStore store,
    IStudioPasswordHasher hasher,
    IStudioOneTimeTokenService oneTimeTokens,
    IStudioEmailSender email,
    IStudioUserAssetStore assets,
    IStudioClock clock,
    StudioOptions options)
{
    private static readonly HashSet<string> AllowedPreferenceKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "language",
        "backgroundImage",
        "lockIdleTimeout",
        "linkOpenMode",
        "searchMode",
        "showPageDots"
    };

    public async Task<StudioAccountResult<StudioUser>> GetProfileAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await store.FindUserByIdAsync(userId, cancellationToken);
        return user is null
            ? StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.NotFound, "账号不存在。")
            : StudioAccountResult<StudioUser>.Success(user);
    }

    public async Task<StudioAccountResult<StudioUser>> UpdateProfileAsync(
        Guid userId,
        string? usernameInput,
        string? emailInput,
        CancellationToken cancellationToken)
    {
        var user = await store.FindUserByIdAsync(userId, cancellationToken);
        if (user is null) return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.NotFound, "账号不存在。");

        var now = clock.UtcNow;
        var changed = false;
        var emailChanged = false;
        StudioEmailToken? token = null;
        StudioOutboxMessage? outbox = null;

        if (usernameInput is not null)
        {
            var username = StudioAccountRules.NormaliseUsername(usernameInput);
            var validation = StudioAccountRules.ValidateUsername(username);
            if (validation is not null) return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.Validation, validation);

            if (!string.Equals(username, user.Username, StringComparison.Ordinal))
            {
                if (await store.UsernameExistsAsync(username, cancellationToken))
                    return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.Conflict, "用户名已被占用。");

                user.Username = username;
                user.UsernameLower = username.ToLowerInvariant();
                changed = true;
            }
        }

        if (emailInput is not null)
        {
            var address = StudioAccountRules.NormaliseEmail(emailInput);
            var validation = StudioAccountRules.ValidateEmail(address);
            if (validation is not null) return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.Validation, validation);

            if (!string.Equals(address, user.Email, StringComparison.Ordinal))
            {
                if (await store.EmailExistsAsync(address, cancellationToken))
                    return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.Conflict, "邮箱已被占用。");

                if (options.RequireEmailVerification && !email.IsConfigured)
                    return StudioAccountResult<StudioUser>.Failure(StudioErrorCodes.EmailNotConfigured, "服务器未配置邮件发送，无法修改邮箱。");

                user.Email = address;
                changed = true;
                emailChanged = true;

                if (options.RequireEmailVerification)
                {
                    user.EmailVerified = false;
                    user.EmailVerifiedAt = null;
                    var plaintext = oneTimeTokens.CreateToken();
                    token = NewEmailToken(user, plaintext, now);
                    outbox = NewOutbox(user, plaintext, now);
                }
            }
        }

        if (!changed) return StudioAccountResult<StudioUser>.Success(user);

        user.UpdatedAt = now;
        user.Revision += 1;
        await store.UpdateProfileAsync(user, token, outbox, emailChanged, cancellationToken);
        return StudioAccountResult<StudioUser>.Success(user);
    }

    public async Task<StudioAccountResult<StudioPreferencesDocument>> GetPreferencesAsync(Guid userId, CancellationToken cancellationToken)
    {
        var record = await store.GetPreferencesAsync(userId, cancellationToken);
        return StudioAccountResult<StudioPreferencesDocument>.Success(new StudioPreferencesDocument
        {
            Preferences = ParsePreferences(record?.Json),
            UpdatedAt = record?.UpdatedAt
        });
    }

    public async Task<StudioAccountResult<StudioPreferencesDocument>> UpdatePreferencesAsync(
        Guid userId,
        Dictionary<string, JsonElement>? incoming,
        CancellationToken cancellationToken)
    {
        var filtered = (incoming ?? [])
            .Where(pair => AllowedPreferenceKeys.Contains(pair.Key))
            .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);

        var now = clock.UtcNow;
        await store.UpsertPreferencesAsync(new StudioPreferences
        {
            UserId = userId,
            Json = SerializePreferences(filtered),
            UpdatedAt = now
        }, cancellationToken);

        return StudioAccountResult<StudioPreferencesDocument>.Success(new StudioPreferencesDocument
        {
            Preferences = filtered,
            UpdatedAt = now
        });
    }

    public async Task<StudioAccountResult<bool>> ChangePasswordAsync(
        Guid userId,
        string currentTokenId,
        string currentPassword,
        string newPassword,
        CancellationToken cancellationToken)
    {
        var validation = StudioAccountRules.ValidatePassword(newPassword);
        if (validation is not null) return StudioAccountResult<bool>.Failure(StudioErrorCodes.Validation, validation);

        var user = await store.FindUserByIdAsync(userId, cancellationToken);
        if (user is null) return StudioAccountResult<bool>.Failure(StudioErrorCodes.Unauthorized, "登录状态无效。");

        if (!hasher.Verify(currentPassword, user.PasswordHash).Success)
            return StudioAccountResult<bool>.Failure(StudioErrorCodes.InvalidCredentials, "当前密码不正确。");

        await store.ChangePasswordAsync(userId, hasher.Hash(newPassword), currentTokenId, clock.UtcNow, cancellationToken);
        return StudioAccountResult<bool>.Success(true);
    }

    public async Task<StudioAccountResult<bool>> DeleteAccountAsync(Guid userId, string password, CancellationToken cancellationToken)
    {
        var user = await store.FindUserByIdAsync(userId, cancellationToken);
        if (user is null) return StudioAccountResult<bool>.Failure(StudioErrorCodes.NotFound, "账号不存在。");

        if (!hasher.Verify(password, user.PasswordHash).Success)
            return StudioAccountResult<bool>.Failure(StudioErrorCodes.InvalidCredentials, "密码不正确。");

        if (user.Role == StudioUserRole.Admin && await store.CountUsableAdminsAsync(userId, cancellationToken) == 0)
            return StudioAccountResult<bool>.Failure(StudioErrorCodes.LastAdmin, "这是最后一个可登录的管理员账号，无法注销。");

        await store.DeleteUserAsync(userId, cancellationToken);
        return StudioAccountResult<bool>.Success(true);
    }

    public async Task<StudioAccountResult<List<StudioSession>>> ListSessionsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var sessions = await store.ListActiveSessionsAsync(userId, clock.UtcNow, cancellationToken);
        return StudioAccountResult<List<StudioSession>>.Success(sessions);
    }

    public async Task<StudioAccountResult<int>> RevokeOtherSessionsAsync(Guid userId, string currentTokenId, CancellationToken cancellationToken)
    {
        var revoked = await store.RevokeAllSessionsAsync(userId, clock.UtcNow, currentTokenId, cancellationToken);
        return StudioAccountResult<int>.Success(revoked);
    }

    public async Task<StudioAccountResult<string>> SaveAvatarAsync(
        Guid userId,
        byte[] content,
        string extension,
        CancellationToken cancellationToken)
    {
        if (content.Length == 0) return StudioAccountResult<string>.Failure(StudioErrorCodes.Validation, "请选择图片文件。");
        if (content.Length > options.AvatarMaxBytes)
            return StudioAccountResult<string>.Failure(StudioErrorCodes.PayloadTooLarge, "头像不能超过 2 MB。");
        if (!IsSupportedImage(content, extension))
            return StudioAccountResult<string>.Failure(StudioErrorCodes.Validation, "仅支持 PNG / JPEG / WebP / GIF。");

        var user = await store.FindUserByIdAsync(userId, cancellationToken);
        if (user is null) return StudioAccountResult<string>.Failure(StudioErrorCodes.NotFound, "账号不存在。");

        var fileName = $"avatar{extension.ToLowerInvariant()}";
        var relative = await assets.SaveAsync(userId, fileName, content, cancellationToken);
        var previous = user.AvatarPath;
        user.AvatarPath = relative;
        user.UpdatedAt = clock.UtcNow;
        user.Revision += 1;
        await store.UpdateUserAsync(user, cancellationToken);

        if (previous is not null && previous != relative) await assets.DeleteAsync(previous, cancellationToken);

        return StudioAccountResult<string>.Success($"/api/studio/user/avatar?v={user.Revision}");
    }

    public async Task<StudioAccountResult<string>> ResolveAvatarAsync(
        Guid targetUserId,
        Guid callerUserId,
        bool callerIsAdmin,
        CancellationToken cancellationToken)
    {
        if (targetUserId != callerUserId && !callerIsAdmin)
            return StudioAccountResult<string>.Failure(StudioErrorCodes.Forbidden, "没有权限读取该头像。");

        var user = await store.FindUserByIdAsync(targetUserId, cancellationToken);
        if (user?.AvatarPath is null)
            return StudioAccountResult<string>.Failure(StudioErrorCodes.NotFound, "头像不存在。");

        var absolute = assets.Resolve(user.AvatarPath);
        if (absolute is null || !File.Exists(absolute))
            return StudioAccountResult<string>.Failure(StudioErrorCodes.NotFound, "头像不存在。");

        return StudioAccountResult<string>.Success(absolute);
    }

    public static bool IsSupportedImage(ReadOnlySpan<byte> content, string extension)
    {
        return extension.ToLowerInvariant() switch
        {
            ".png" => content.Length >= 8 && content[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
            ".jpg" or ".jpeg" => content.Length >= 3 && content[0] == 0xFF && content[1] == 0xD8 && content[2] == 0xFF,
            ".gif" => content.Length >= 6 && (content[..6].SequenceEqual("GIF87a"u8) || content[..6].SequenceEqual("GIF89a"u8)),
            ".webp" => content.Length >= 12 && content[..4].SequenceEqual("RIFF"u8) && content.Slice(8, 4).SequenceEqual("WEBP"u8),
            _ => false
        };
    }

    private StudioEmailToken NewEmailToken(StudioUser user, string plaintext, DateTimeOffset now)
    {
        return new StudioEmailToken
        {
            UserId = user.Id,
            Purpose = StudioEmailTokenPurpose.VerifyEmail,
            TokenHash = oneTimeTokens.Hash(plaintext),
            CreatedAt = now,
            ExpiresAt = now.AddHours(Math.Max(1, options.EmailVerifyHours))
        };
    }

    private StudioOutboxMessage NewOutbox(StudioUser user, string plaintext, DateTimeOffset now)
    {
        var baseUrl = string.IsNullOrWhiteSpace(options.PublicBaseUrl) ? "http://localhost:5000" : options.PublicBaseUrl.TrimEnd('/');
        var link = $"{baseUrl}/verify-email?token={Uri.EscapeDataString(plaintext)}";
        return new StudioOutboxMessage
        {
            UserId = user.Id,
            Purpose = StudioEmailTokenPurpose.VerifyEmail,
            Recipient = user.Email,
            Subject = "验证你的 Studio 邮箱",
            HtmlBody = $"<p>你好 {WebUtility.HtmlEncode(user.Username)}，</p><p>请点击下面的链接完成邮箱验证（{Math.Max(1, options.EmailVerifyHours)} 小时内有效）：</p><p><a href=\"{WebUtility.HtmlEncode(link)}\">验证邮箱</a></p>",
            CreatedAt = now,
            NextAttemptAt = now
        };
    }

    private static Dictionary<string, JsonElement> ParsePreferences(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.EnumerateObject().ToDictionary(property => property.Name, property => property.Value.Clone(), StringComparer.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string SerializePreferences(Dictionary<string, JsonElement> preferences)
    {
        var buffer = new ArrayBufferWriter<byte>();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            foreach (var (key, value) in preferences)
            {
                writer.WritePropertyName(key);
                value.WriteTo(writer);
            }

            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.WrittenSpan);
    }
}