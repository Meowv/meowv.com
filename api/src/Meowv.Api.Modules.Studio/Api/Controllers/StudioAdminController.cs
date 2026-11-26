using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.Sqlite;

namespace Meowv.Api.Modules.Studio.Api.Controllers;

[ApiController]
[EndpointModule("studio")]
public sealed class StudioAdminController(StudioAdminService admins, IStudioClock clock, IConfiguration configuration, ApiPaths paths) : StudioControllerBase
{
    [HttpGet("/api/studio/admin/users")]
    [Authorize(Policy = StudioPolicies.Admin)]
    [EnableRateLimiting("studio-read")]
    [EndpointSummary("管理员列出全部用户及会话数量。")]
    public async Task<IResult> Users(CancellationToken cancellationToken)
    {
        var result = await admins.ListUsersAsync(cancellationToken);
        return StudioResults.From(result, HttpContext, rows => Results.Json(new StudioAdminUsersResponse
        {
            Users =
            [
                .. rows.Select(row => new StudioAdminUserItem
                {
                    Id = row.Id,
                    Username = row.Username,
                    Email = row.Email,
                    Role = StudioAccountRules.ToWire(row.Role),
                    EmailVerified = row.EmailVerified,
                    CreatedAt = row.CreatedAt,
                    Revision = row.Revision,
                    SessionCount = row.SessionCount
                })
            ]
        }, StudioJson.Options));
    }

    [HttpPut("/api/studio/admin/users/{id:guid}/role")]
    [Authorize(Policy = StudioPolicies.Admin)]
    [EnableRateLimiting("studio-admin")]
    [EndpointSummary("修改用户角色；不能降级最后一个可登录管理员。")]
    public async Task<IResult> SetRole(Guid id, [FromBody] StudioRoleRequest request, CancellationToken cancellationToken)
    {
        var actor = StudioCurrentUser.Id(User);
        if (actor is null) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);

        var result = await admins.SetRoleAsync(actor.Value, id, request.Role, cancellationToken);
        return StudioResults.From(result, HttpContext, user => Results.Json(new StudioSetRoleResponse
        {
            Id = user.Id,
            Role = StudioAccountRules.ToWire(user.Role),
            Revision = user.Revision
        }, StudioJson.Options));
    }

    [HttpDelete("/api/studio/admin/users/{id:guid}")]
    [Authorize(Policy = StudioPolicies.Admin)]
    [EnableRateLimiting("studio-admin")]
    [EndpointSummary("删除用户；不能删除自己或最后一个可登录管理员。")]
    public async Task<IResult> DeleteUser(Guid id, CancellationToken cancellationToken)
    {
        var actor = StudioCurrentUser.Id(User);
        if (actor is null) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);

        var result = await admins.DeleteUserAsync(actor.Value, id, cancellationToken);
        return StudioResults.From(result, HttpContext, _ => Results.Json(new StudioMessageResponse("用户已删除。"), StudioJson.Options));
    }

    [HttpGet("/api/studio/admin/users/{id:guid}/sessions")]
    [Authorize(Policy = StudioPolicies.Admin)]
    [EnableRateLimiting("studio-read")]
    [EndpointSummary("管理员列出指定用户会话。")]
    public async Task<IResult> Sessions(Guid id, [FromQuery] bool activeOnly, CancellationToken cancellationToken)
    {
        var result = await admins.ListSessionsAsync(id, activeOnly, cancellationToken);
        return StudioResults.From(result, HttpContext, sessions => Results.Json(new StudioAdminSessionsResponse
        {
            Sessions =
            [
                .. sessions.Select(session => new StudioAdminSessionItem
                {
                    Id = session.Id,
                    TokenId = session.TokenId,
                    CreatedAt = session.CreatedAt,
                    ExpiresAt = session.ExpiresAt,
                    RevokedAt = session.RevokedAt,
                    UserAgent = session.UserAgent,
                    Active = session.IsActive(clock.UtcNow)
                })
            ]
        }, StudioJson.Options));
    }

    [HttpDelete("/api/studio/admin/users/{id:guid}/sessions")]
    [Authorize(Policy = StudioPolicies.Admin)]
    [EnableRateLimiting("studio-admin")]
    [EndpointSummary("管理员撤销指定用户会话；未知用户返回 404。")]
    public async Task<IResult> RevokeSessions(Guid id, [FromBody] StudioRevokeSessionsRequest? request, CancellationToken cancellationToken)
    {
        var actor = StudioCurrentUser.Id(User);
        if (actor is null) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);

        var result = await admins.RevokeSessionsAsync(actor.Value, id, request?.ExceptTokenId, cancellationToken);
        return StudioResults.From(result, HttpContext, revoked => Results.Json(new StudioRevokeSessionsResponse { Revoked = revoked }, StudioJson.Options));
    }

    [HttpGet("/api/studio/admin/stats")]
    [Authorize(Policy = StudioPolicies.Admin)]
    [EnableRateLimiting("studio-read")]
    [EndpointSummary("管理员查看用户、会话、布局与数据库统计。")]
    public async Task<IResult> Stats(CancellationToken cancellationToken)
    {
        var stats = await admins.GetStatsAsync(DatabaseBytes(), cancellationToken);
        return Results.Json(new StudioAdminStatsResponse
        {
            UserCount = stats.UserCount,
            AdminCount = stats.AdminCount,
            VerifiedCount = stats.VerifiedCount,
            ActiveSessionCount = stats.ActiveSessionCount,
            SessionCount = stats.SessionCount,
            LayoutCount = stats.LayoutCount,
            PreferenceCount = stats.PreferenceCount,
            DatabaseBytes = stats.DatabaseBytes,
            DatabaseNote = stats.DatabaseNote
        }, StudioJson.Options);
    }

    private long DatabaseBytes()
    {
        try
        {
            var configured = configuration.GetConnectionString("DefaultConnection");
            if (string.IsNullOrWhiteSpace(configured)) return 0;

            var builder = new SqliteConnectionStringBuilder(configured);
            if (string.IsNullOrWhiteSpace(builder.DataSource)) return 0;

            var path = paths.Resolve(builder.DataSource);
            return System.IO.File.Exists(path) ? new FileInfo(path).Length : 0;
        }
        catch (IOException)
        {
            return 0;
        }
    }
}