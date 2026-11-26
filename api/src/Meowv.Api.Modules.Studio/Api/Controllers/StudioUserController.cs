using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.Studio.Api.Controllers;

[ApiController]
[EndpointModule("studio", OptionsType = typeof(StudioOptions))]
public sealed class StudioUserController(StudioUserService users, StudioOptions options) : StudioControllerBase
{
    private static readonly Dictionary<string, string> AvatarContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".webp"] = "image/webp",
        [".gif"] = "image/gif"
    };

    private Guid? UserId => StudioCurrentUser.Id(User);

    [HttpGet("/api/studio/user/profile")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-read")]
    [EndpointSummary("读取当前登录用户资料。")]
    public async Task<IResult> GetProfile(CancellationToken cancellationToken)
    {
        if (UserId is not { } id) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);
        var result = await users.GetProfileAsync(id, cancellationToken);
        return StudioResults.From(result, HttpContext, user => Results.Json(StudioUserProfileResponse.From(user), StudioJson.Options));
    }

    [HttpPut("/api/studio/user/profile")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-write")]
    [EndpointSummary("更新用户名或邮箱；修改邮箱会重置验证状态。")]
    public async Task<IResult> UpdateProfile([FromBody] StudioUpdateProfileRequest request, CancellationToken cancellationToken)
    {
        if (UserId is not { } id) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);
        var result = await users.UpdateProfileAsync(id, request.Username, request.Email, cancellationToken);
        return StudioResults.From(result, HttpContext, user => Results.Json(StudioUserProfileResponse.From(user), StudioJson.Options));
    }

    [HttpGet("/api/studio/user/preferences")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-read")]
    [EndpointSummary("读取当前用户偏好文档。")]
    public async Task<IResult> GetPreferences(CancellationToken cancellationToken)
    {
        if (UserId is not { } id) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);
        var result = await users.GetPreferencesAsync(id, cancellationToken);
        return StudioResults.From(result, HttpContext, document => Results.Json(new StudioPreferencesResponse
        {
            Preferences = document.Preferences,
            UpdatedAt = document.UpdatedAt
        }, StudioJson.Options));
    }

    [HttpPut("/api/studio/user/preferences")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-write")]
    [EndpointSummary("整体替换当前用户偏好；未知键会被丢弃。")]
    public async Task<IResult> UpdatePreferences([FromBody] StudioUpdatePreferencesRequest request, CancellationToken cancellationToken)
    {
        if (UserId is not { } id) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);
        var result = await users.UpdatePreferencesAsync(id, request.Preferences, cancellationToken);
        return StudioResults.From(result, HttpContext, document => Results.Json(new StudioPreferencesResponse
        {
            Preferences = document.Preferences,
            UpdatedAt = document.UpdatedAt
        }, StudioJson.Options));
    }

    [HttpPost("/api/studio/user/password")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-write")]
    [EndpointSummary("修改密码；保留当前会话，撤销其他设备。")]
    public async Task<IResult> ChangePassword([FromBody] StudioChangePasswordRequest request, CancellationToken cancellationToken)
    {
        if (UserId is not { } id) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);
        var tokenId = StudioCurrentUser.TokenId(User) ?? string.Empty;
        var result = await users.ChangePasswordAsync(id, tokenId, request.CurrentPassword, request.NewPassword, cancellationToken);
        return StudioResults.From(result, HttpContext, _ => Results.Json(new StudioMessageResponse("密码已更新，其他设备已退出登录。"), StudioJson.Options));
    }

    [HttpPost("/api/studio/user/avatar")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-write")]
    [RequestSizeLimit(StudioDesktopLimits.MaxAvatarBytes + 4096)]
    [EndpointSummary("上传头像；仅接受 PNG/JPEG/WebP/GIF，且校验文件魔数。")]
    public async Task<IResult> UploadAvatar(IFormFile? file, CancellationToken cancellationToken)
    {
        if (UserId is not { } id) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);
        if (file is null || file.Length == 0)
            return StudioResults.Error(StatusCodes.Status400BadRequest, "请选择图片文件。", StudioErrorCodes.Validation, HttpContext);

        var maxBytes = options.AvatarMaxBytes;
        if (file.Length > maxBytes)
            return StudioResults.Error(StatusCodes.Status413PayloadTooLarge, "头像超过大小上限。", StudioErrorCodes.PayloadTooLarge, HttpContext);

        var extension = Path.GetExtension(file.FileName);
        if (!AvatarContentTypes.TryGetValue(extension, out _) ||
            !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return StudioResults.Error(StatusCodes.Status400BadRequest, "仅支持 PNG / JPEG / WebP / GIF。", StudioErrorCodes.Validation, HttpContext);

        await using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, cancellationToken);
        var result = await users.SaveAvatarAsync(id, buffer.ToArray(), extension, cancellationToken);
        return StudioResults.From(result, HttpContext, url => Results.Json(new StudioAvatarResponse
        {
            Message = "头像已更新。",
            AvatarUrl = url
        }, StudioJson.Options));
    }

    [HttpGet("/api/studio/user/avatar")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-read")]
    [EndpointSummary("读取本人或管理范围内的用户头像。")]
    public async Task<IResult> GetAvatar([FromQuery] Guid? userId, CancellationToken cancellationToken)
    {
        if (UserId is not { } caller) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);

        var target = userId ?? caller;
        var isAdmin = string.Equals(User.FindFirst(StudioPolicies.RoleClaim)?.Value, "admin", StringComparison.Ordinal);
        var result = await users.ResolveAvatarAsync(target, caller, isAdmin, cancellationToken);
        if (!result.Ok)
            return StudioResults.From(result, HttpContext);

        var absolute = result.Value!;
        var contentType = AvatarContentTypes.GetValueOrDefault(Path.GetExtension(absolute), "application/octet-stream");
        Response.Headers.CacheControl = "private, no-store";
        return Results.File(absolute, contentType);
    }

    [HttpGet("/api/studio/user/sessions")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-read")]
    [EndpointSummary("列出当前用户仍活跃的会话。")]
    public async Task<IResult> ListSessions(CancellationToken cancellationToken)
    {
        if (UserId is not { } id) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);
        var currentTokenId = StudioCurrentUser.TokenId(User) ?? string.Empty;
        var result = await users.ListSessionsAsync(id, cancellationToken);
        return StudioResults.From(result, HttpContext, sessions => Results.Json(sessions.Select(session => new StudioSessionResponse
        {
            Id = session.Id,
            CreatedAt = session.CreatedAt,
            ExpiresAt = session.ExpiresAt,
            IsCurrent = session.TokenId == currentTokenId,
            UserAgent = session.UserAgent
        }).ToList(), StudioJson.Options));
    }

    [HttpDelete("/api/studio/user/sessions")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-write")]
    [EndpointSummary("撤销除当前设备外的全部会话。")]
    public async Task<IResult> RevokeOtherSessions(CancellationToken cancellationToken)
    {
        if (UserId is not { } id) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);
        var tokenId = StudioCurrentUser.TokenId(User) ?? string.Empty;
        var result = await users.RevokeOtherSessionsAsync(id, tokenId, cancellationToken);
        return StudioResults.From(result, HttpContext, _ => Results.Json(new StudioMessageResponse("其他设备已退出登录。"), StudioJson.Options));
    }

    [HttpDelete("/api/studio/user/account")]
    [Authorize(Policy = StudioPolicies.User)]
    [EnableRateLimiting("studio-write")]
    [EndpointSummary("注销账号；必须提供当前密码。")]
    public async Task<IResult> DeleteAccount([FromBody] StudioDeleteAccountRequest request, CancellationToken cancellationToken)
    {
        if (UserId is not { } id) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);
        var result = await users.DeleteAccountAsync(id, request.Password, cancellationToken);
        return StudioResults.From(result, HttpContext, _ => Results.Json(new StudioMessageResponse("账号已注销。"), StudioJson.Options));
    }
}