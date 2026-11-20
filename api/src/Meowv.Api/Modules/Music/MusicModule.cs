using Meowv.Api.Core;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Storage;
using Meowv.Api.Modules.Music.QQ;

namespace Meowv.Api.Modules.Music;

public sealed class MusicModule : IEndpointModule
{
    public string Name => "music";
    public string Description => "音乐搜索、候选与播放资源解析。";
    public void ConfigureMiddleware(IApplicationBuilder application) => application.UseMiddleware<MusicMiddleware>();

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        var music = endpoints.MapGroup("/api/music");
        music.MapGet("/health", (MusicRuntime runtime, MusicCatalog catalog) => Results.Json(
                new MusicHealth(catalog.Status(runtime.Status), runtime.Available ? catalog.EnabledCount : 0, catalog.Version),
                MusicJsonContext.Default.MusicHealth, statusCode: runtime.Status is "disabled" or "unavailable" ? 503 : 200))
            .WithSummary("音乐模块与来源就绪状态。")
            .AllowAnonymous();
        if (!endpoints.ServiceProvider.GetRequiredService<MusicOptions>().Enabled) return;
        if (endpoints.ServiceProvider.GetRequiredService<MusicRuntime>().Available)
        {
            var setup = music.MapGroup("/setup/devices").RequireAuthorization(ApiAuthorization.ManagementPolicy);
            setup.MapGet("", (MusicDeviceStore devices) => Results.Json(devices.List(), MusicJsonContext.Default.MusicDeviceArray))
                .WithSummary("列出已签发的音乐设备令牌。")
                .RequireRateLimiting("setup-ui");
            setup.MapPost("", async (HttpContext context, MusicDeviceStore devices) =>
                {
                    if (!context.Request.HasJsonContentType()) throw MusicException.Invalid();
                    var bytes = new byte[4097];
                    var length = 0;
                    while (length < bytes.Length)
                    {
                        var read = await context.Request.Body.ReadAsync(bytes.AsMemory(length), context.RequestAborted);
                        if (read == 0) break;
                        length += read;
                    }

                    if (length > 4096) throw MusicException.Invalid();
                    var input = System.Text.Json.JsonSerializer.Deserialize(bytes.AsSpan(0, length), MusicJsonContext.Default.MusicDeviceRequest);
                    if (input is null) throw MusicException.Invalid();
                    return Results.Json(devices.Issue(input.Alias), MusicJsonContext.Default.MusicDeviceIssued, statusCode: 201);
                }).WithSummary("签发新的音乐设备令牌。")
                .RequireRateLimiting("api-auth");
            setup.MapDelete("/{id}", (string id, MusicDeviceStore devices) => devices.Revoke(id) ? Results.NoContent() : Results.NotFound())
                .WithSummary("撤销指定的音乐设备令牌。")
                .RequireRateLimiting("api-auth");
            QQSetupEndpoints.Map(music);
        }

        var secured = music.MapGroup("").RequireAuthorization(MusicAccessHandler.SchemeName)
            .WithMetadata(new MusicProtectedEndpoint(), new EndpointAccessMetadata("音乐专用设备令牌（Authorization 或 access_token）"))
            .RequireRateLimiting("music");
        music.MapPost("/admin/charts/refresh", async (MusicRuntime runtime, MusicDailyFeeds feeds, CancellationToken ct) =>
                !runtime.Available
                    ? throw new MusicException("source_unavailable", "音乐服务尚未就绪。", 503)
                    : Results.Json(await feeds.GetDailyAsync(true, ct), MusicChartJsonContext.Default.MusicDailyPage))
            .WithSummary("强制刷新每日榜单快照。")
            .RequireAuthorization(ApiAuthorization.ManagementPolicy).RequireRateLimiting("api-auth");

        secured.MapGet("/providers", (MusicCatalog catalog) => Results.Json(new MusicProviders(
                catalog.Providers()),
            MusicJsonContext.Default.MusicProviders)).WithSummary("列出可用的音乐来源。");
        secured.MapGet("/search", async (HttpContext context, MusicCatalog catalog, QQMembership member) => Results.Json(
                await catalog.SearchAsync(One(context, "q"), Limit(context), One(context, "cursor"), context.RequestAborted, member.ForDevice(context)), MusicJsonContext.Default.MusicSearchPage))
            .WithSummary("按关键词搜索曲目，支持游标分页。");
        secured.MapGet("/charts/daily", async (HttpContext context, MusicDailyFeeds feeds, QQMembership member, CancellationToken ct) =>
                Results.Json(await feeds.GetDailyAsync(false, ct, member.ForDevice(context)), MusicChartJsonContext.Default.MusicDailyPage))
            .WithSummary("读取当日榜单快照。");
        secured.MapGet("/recommendations", async (HttpContext context, MusicDailyFeeds feeds, QQMembership member) =>
                Results.Json(await feeds.RecommendAsync(context.RequestAborted, member.ForDevice(context)),
                    MusicJsonContext.Default.MusicRecommendationPage))
            .WithSummary("读取每日推荐曲目。");
        secured.MapGet("/recommendations/candidates", async (HttpContext context, MusicCandidatePool pool, QQMembership member) =>
                Results.Json(await pool.ReadAsync(context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                                                  ?? throw MusicException.Invalid(), Limit(context), One(context, "cursor"), member.ForDevice(context), context.RequestAborted),
                    MusicJsonContext.Default.MusicRecommendationPage))
            .WithSummary("分页读取滚动音乐推荐候选。");
        secured.MapGet("/recommendations/radio", async (HttpContext context, MusicDailyFeeds feeds, QQMembership member, CancellationToken ct) =>
                Results.Json(await feeds.RadioAsync(ct, member.ForDevice(context)), MusicJsonContext.Default.MusicRecommendationPage))
            .WithSummary("读取「猜你喜欢」电台候选。");
        secured.MapGet("/lyrics", async (HttpContext context, MusicCatalog catalog) => Results.Json(
            await catalog.LyricsAsync(One(context, "trackId"), One(context, "providerId"), context.RequestAborted),
            MusicJsonContext.Default.MusicLyrics)).WithSummary("读取指定曲目的歌词。");
        secured.MapPost("/resolve", async (HttpContext context, MusicCatalog catalog, QQMembership member, MusicCandidatePool pool) =>
        {
            if (!context.Request.HasJsonContentType()) throw MusicException.Invalid();
            var bytes = new byte[4097];
            var length = 0;
            while (length < bytes.Length)
            {
                var read = await context.Request.Body.ReadAsync(bytes.AsMemory(length), context.RequestAborted);
                if (read == 0) break;
                length += read;
            }

            if (length > 4096) throw MusicException.Invalid();
            var input = System.Text.Json.JsonSerializer.Deserialize(bytes.AsSpan(0, length), MusicJsonContext.Default.MusicResolveRequest);
            if (input is null) throw MusicException.Invalid();
            if (input.TrackId is { Length: >= 1 and <= 128 } id && !catalog.HasTrack(id)) pool.Restore(id);
            return Results.Json(await catalog.ResolveAsync(input, context.RequestAborted, member.ForDevice(context)), MusicJsonContext.Default.MusicResolvedTrack);
        }).WithSummary("解析曲目的可播放资源地址。");
    }

    private static string? One(HttpContext context, string name)
    {
        var values = context.Request.Query[name];
        if (values.Count > 1) throw MusicException.Invalid();
        return values.Count == 0 ? null : values[0];
    }

    private static int? Limit(HttpContext context)
    {
        var text = One(context, "limit");
        if (text is null) return null;
        return !int.TryParse(text, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var limit) ? throw MusicException.Invalid() : limit;
    }
}