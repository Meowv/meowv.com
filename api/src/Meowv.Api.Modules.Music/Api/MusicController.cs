using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.Music.Api;

[ApiController]
[EndpointModule("music", OptionsType = typeof(MusicOptions), RuntimeType = typeof(MusicRuntime))]
public sealed class MusicController : ControllerBase
{
    [HttpGet("/api/music/health")]
    [AllowAnonymous]
    [ModuleHealth]
    [EndpointSummary("音乐模块与来源就绪状态。")]
    public IResult Health([FromServices] MusicRuntime runtime, [FromServices] MusicCatalog catalog) => Results.Json(new MusicHealth(catalog.Status(runtime.Status), runtime.Available ? catalog.EnabledCount : 0, catalog.Version), MusicJsonContext.Default.MusicHealth, statusCode: runtime.Status is "disabled" or "unavailable" ? 503 : 200);

    [HttpPost("/api/music/devices/register")]
    [AllowAnonymous]
    [ModuleReady]
    [EndpointAccess("首次登记待审批；换钥需匹配已激活的安装标识")]
    [EnableRateLimiting("music-register")]
    [EndpointSummary("登记待审批音乐设备；已激活设备按原安装标识自动换钥。")]
    public async Task<IResult> RegisterDevice([FromServices] MusicDeviceStore devices)
    {
        var status = devices.Register(await ReadBody(HttpContext, MusicJsonContext.Default.MusicDeviceRegister));
        return Results.Json(status, MusicJsonContext.Default.MusicDeviceStatus, statusCode: status.Status == "active" ? 200 : 202);
    }

    [HttpGet("/api/music/devices/status/{installationId}")]
    [AllowAnonymous]
    [ModuleReady]
    [EnableRateLimiting("music-activation-status")]
    [EndpointSummary("查询安装激活状态及设备加密令牌。")]
    public IResult DeviceStatus([FromRoute] string installationId, [FromServices] MusicDeviceStore devices) => devices.Status(installationId) is { } status ? Results.Json(status, MusicJsonContext.Default.MusicDeviceStatus) : throw new MusicException("device_not_found", "设备登记不存在或已过期。", 404);

    [HttpGet("/api/music/setup/devices")]
    [Authorize(Policy = ApiAuthorization.ManagementPolicy)]
    [ModuleReady]
    [EnableRateLimiting("setup-ui")]
    [EndpointSummary("列出音乐设备及激活状态。")]
    public IResult ListDevices([FromServices] MusicDeviceStore devices) => Results.Json(devices.List(), MusicJsonContext.Default.MusicDeviceArray);

    [HttpPost("/api/music/setup/devices/{deviceId}/activate")]
    [Authorize(Policy = ApiAuthorization.ManagementPolicy)]
    [ModuleReady]
    [EnableRateLimiting("api-auth")]
    [EndpointSummary("激活待审批或已撤销的音乐设备。")]
    public IResult ActivateDevice([FromRoute] string deviceId, [FromServices] MusicDeviceStore devices) => devices.Activate(deviceId) is { } active ? Results.Json(active, MusicJsonContext.Default.MusicDeviceActivation) : Results.NotFound();

    [HttpDelete("/api/music/setup/devices/{deviceId}")]
    [Authorize(Policy = ApiAuthorization.ManagementPolicy)]
    [ModuleReady]
    [EnableRateLimiting("api-auth")]
    [EndpointSummary("撤销指定音乐设备。")]
    public IResult RevokeDevice([FromRoute] string deviceId, [FromServices] MusicDeviceStore devices)
        => devices.Revoke(deviceId) ? Results.NoContent() : Results.NotFound();

    [HttpDelete("/api/music/setup/devices/{deviceId}/record")]
    [Authorize(Policy = ApiAuthorization.ManagementPolicy)]
    [ModuleReady]
    [EnableRateLimiting("api-auth")]
    [EndpointSummary("删除已撤销的音乐设备记录。")]
    public IResult DeleteRevokedDevice([FromRoute] string deviceId, [FromServices] MusicDeviceStore devices) => devices.DeleteRevoked(deviceId) ? Results.NoContent() : Results.NotFound();

    [HttpPost("/api/music/admin/charts/refresh")]
    [Authorize(Policy = ApiAuthorization.ManagementPolicy)]
    [EnableRateLimiting("api-auth")]
    [EndpointSummary("强制刷新每日榜单快照。")]
    public async Task<IResult> RefreshCharts([FromServices] MusicRuntime runtime, CancellationToken ct)
    {
        var feeds = HttpContext.RequestServices.GetRequiredService<MusicDailyFeeds>();
        return !runtime.Available ? throw new MusicException("source_unavailable", "音乐服务尚未就绪。", 503) : Results.Json(await feeds.GetDailyAsync(true, ct), MusicChartJsonContext.Default.MusicDailyPage);
    }

    [HttpGet("/api/music/providers")]
    [Authorize(Policy = MusicAccessHandler.SchemeName)]
    [MusicProtected]
    [EndpointAccess("音乐专用 Bearer 设备令牌")]
    [EnableRateLimiting("music")]
    [EndpointSummary("列出可用的音乐来源。")]
    public IResult Providers([FromServices] MusicCatalog catalog) => Results.Json(new MusicProviders(catalog.Providers()), MusicJsonContext.Default.MusicProviders);

    [HttpGet("/api/music/search")]
    [Authorize(Policy = MusicAccessHandler.SchemeName)]
    [MusicProtected]
    [EndpointAccess("音乐专用 Bearer 设备令牌")]
    [EnableRateLimiting("music")]
    [EndpointSummary("按关键词搜索曲目，支持游标分页。")]
    public async Task<IResult> Search([FromServices] MusicCatalog catalog)
    {
        var member = HttpContext.RequestServices.GetRequiredService<QQMembership>();
        return Results.Json(await catalog.SearchAsync(One(HttpContext, "q"), Limit(HttpContext), One(HttpContext, "cursor"), HttpContext.RequestAborted, member.ForDevice(HttpContext.ToCallerContext().DeviceId)), MusicJsonContext.Default.MusicSearchPage);
    }

    [HttpGet("/api/music/charts/daily")]
    [Authorize(Policy = MusicAccessHandler.SchemeName)]
    [MusicProtected]
    [EndpointAccess("音乐专用 Bearer 设备令牌")]
    [EnableRateLimiting("music")]
    [EndpointSummary("读取当日榜单快照。")]
    public async Task<IResult> DailyCharts(CancellationToken ct)
    {
        var feeds = HttpContext.RequestServices.GetRequiredService<MusicDailyFeeds>();
        var member = HttpContext.RequestServices.GetRequiredService<QQMembership>();
        return Results.Json(await feeds.GetDailyAsync(false, ct, member.ForDevice(HttpContext.ToCallerContext().DeviceId)), MusicChartJsonContext.Default.MusicDailyPage);
    }

    [HttpGet("/api/music/recommendations")]
    [Authorize(Policy = MusicAccessHandler.SchemeName)]
    [MusicProtected]
    [EndpointAccess("音乐专用 Bearer 设备令牌")]
    [EnableRateLimiting("music")]
    [EndpointSummary("读取每日推荐曲目。")]
    public async Task<IResult> Recommendations()
    {
        var feeds = HttpContext.RequestServices.GetRequiredService<MusicDailyFeeds>();
        var member = HttpContext.RequestServices.GetRequiredService<QQMembership>();
        return Results.Json(await feeds.RecommendAsync(HttpContext.RequestAborted, member.ForDevice(HttpContext.ToCallerContext().DeviceId)), MusicJsonContext.Default.MusicRecommendationPage);
    }

    [HttpGet("/api/music/recommendations/candidates")]
    [Authorize(Policy = MusicAccessHandler.SchemeName)]
    [MusicProtected]
    [EndpointAccess("音乐专用 Bearer 设备令牌")]
    [EnableRateLimiting("music")]
    [EndpointSummary("分页读取滚动音乐推荐候选。")]
    public async Task<IResult> RecommendationCandidates()
    {
        var pool = HttpContext.RequestServices.GetRequiredService<MusicCandidatePool>();
        var member = HttpContext.RequestServices.GetRequiredService<QQMembership>();
        return Results.Json(await pool.ReadAsync(HttpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? throw MusicException.Invalid(), Limit(HttpContext), One(HttpContext, "cursor"), member.ForDevice(HttpContext.ToCallerContext().DeviceId), HttpContext.RequestAborted), MusicJsonContext.Default.MusicRecommendationPage);
    }

    [HttpGet("/api/music/recommendations/radio")]
    [Authorize(Policy = MusicAccessHandler.SchemeName)]
    [MusicProtected]
    [EndpointAccess("音乐专用 Bearer 设备令牌")]
    [EnableRateLimiting("music")]
    [EndpointSummary("读取「猜你喜欢」电台候选。")]
    public async Task<IResult> Radio(CancellationToken ct)
    {
        var feeds = HttpContext.RequestServices.GetRequiredService<MusicDailyFeeds>();
        var member = HttpContext.RequestServices.GetRequiredService<QQMembership>();
        return Results.Json(await feeds.RadioAsync(ct, member.ForDevice(HttpContext.ToCallerContext().DeviceId)), MusicJsonContext.Default.MusicRecommendationPage);
    }

    [HttpGet("/api/music/lyrics")]
    [Authorize(Policy = MusicAccessHandler.SchemeName)]
    [MusicProtected]
    [EndpointAccess("音乐专用 Bearer 设备令牌")]
    [EnableRateLimiting("music")]
    [EndpointSummary("读取指定曲目的歌词。")]
    public async Task<IResult> Lyrics([FromServices] MusicCatalog catalog) => Results.Json(await catalog.LyricsAsync(One(HttpContext, "trackId"), One(HttpContext, "providerId"), HttpContext.RequestAborted), MusicJsonContext.Default.MusicLyrics);

    [HttpPost("/api/music/resolve")]
    [Authorize(Policy = MusicAccessHandler.SchemeName)]
    [MusicProtected]
    [EndpointAccess("音乐专用 Bearer 设备令牌")]
    [EnableRateLimiting("music")]
    [EndpointSummary("解析曲目的可播放资源地址。")]
    public async Task<IResult> Resolve([FromServices] MusicCatalog catalog)
    {
        var member = HttpContext.RequestServices.GetRequiredService<QQMembership>();
        var pool = HttpContext.RequestServices.GetRequiredService<MusicCandidatePool>();
        var input = await ReadBody(HttpContext, MusicJsonContext.Default.MusicResolveRequest);
        if (input.TrackId is { Length: >= 1 and <= 128 } id && !catalog.HasTrack(id)) pool.Restore(id);
        return Results.Json(await catalog.ResolveAsync(input, HttpContext.RequestAborted, member.ForDevice(HttpContext.ToCallerContext().DeviceId)), MusicJsonContext.Default.MusicResolvedTrack);
    }

    internal static async Task<T> ReadBody<T>(HttpContext context, JsonTypeInfo<T> type, int maxBytes = 4096)
        where T : class
    {
        if (!context.Request.HasJsonContentType() || context.Request.ContentLength > maxBytes) throw MusicException.Invalid();
        var bytes = new byte[maxBytes + 1];
        var length = await context.Request.Body.ReadAtLeastAsync(bytes, bytes.Length, false, context.RequestAborted);
        if (length > maxBytes) throw MusicException.Invalid();
        return System.Text.Json.JsonSerializer.Deserialize(bytes.AsSpan(0, length), type) ?? throw MusicException.Invalid();
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