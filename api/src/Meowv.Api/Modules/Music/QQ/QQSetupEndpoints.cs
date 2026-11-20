using Meowv.Api.Core;

namespace Meowv.Api.Modules.Music.QQ;

internal static class QQSetupEndpoints
{
    public static void Map(RouteGroupBuilder music)
    {
        var group = music.MapGroup("/setup/qq")
            .RequireAuthorization(ApiAuthorization.ManagementPolicy)
            .AddEndpointFilter((context, next) =>
                ApiCredentials.ReadManagementToken(context.HttpContext.Request).FromQuery
                    ? ValueTask.FromResult<object?>(Results.Unauthorized())
                    : next(context));
        group.MapGet("/session", (QQMembership member) =>
                Results.Json(member.Status(), QQJsonContext.Default.QQSessionStatus))
            .WithSummary("读取 QQ 音乐登录和授权设备状态。")
            .RequireRateLimiting("music-qq-status");
        group.MapPost("/login", (QQMembership member) =>
                Results.Json(member.Start(), QQJsonContext.Default.QQLoginAttempt, statusCode: 202))
            .WithSummary("发起 QQ 音乐 App 扫码登录。").RequireRateLimiting("api-auth");
        group.MapGet("/login/{id:guid}/qr", (Guid id, QQMembership member) =>
                member.Image(id) is { } image ? Results.File(image, "image/png") : Results.NotFound())
            .WithSummary("读取当次 QQ 音乐登录二维码。").RequireRateLimiting("api-auth");
        group.MapDelete("/login/{id:guid}", (Guid id, QQMembership member) =>
        {
            member.Cancel(id);
            return Results.NoContent();
        }).WithSummary("取消当次 QQ 音乐扫码。").RequireRateLimiting("api-auth");
        group.MapDelete("/session", (QQMembership member) =>
        {
            member.Logout();
            return Results.NoContent();
        }).WithSummary("注销后端保存的 QQ 音乐会话。").RequireRateLimiting("api-auth");
        group.MapPut("/devices/{id}", async (string id, HttpContext context, QQMembership member) =>
        {
            if (!context.Request.HasJsonContentType()) throw MusicException.Invalid();
            var buffer = new byte[257];
            var length = await context.Request.Body.ReadAtLeastAsync(buffer, buffer.Length, false, context.RequestAborted);
            if (length == buffer.Length) throw MusicException.Invalid();
            var body = System.Text.Json.JsonSerializer.Deserialize(buffer.AsSpan(0, length), QQJsonContext.Default.QQDeviceGrant);
            if (body?.Enabled is not { } enabled) throw MusicException.Invalid();
            return member.SetDevice(id, enabled) ? Results.NoContent() : Results.NotFound();
        }).WithSummary("设置指定设备的 QQ 音乐会员播放权限。").RequireRateLimiting("api-auth");
    }
}