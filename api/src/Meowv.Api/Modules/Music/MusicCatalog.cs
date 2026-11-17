using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;

namespace Meowv.Api.Modules.Music;

public sealed class MusicCatalog(MusicOptions options, NeteaseMusicProvider netease, TimeProvider clock)
{
    public string Version => NeteaseMusicProvider.ConfigVersion;
    public string Status(string configured) => options.NeteaseEnabled && configured == "ready" && netease.Status != "healthy" ? "degraded" : configured;

    public MusicProvider Provider(string status) =>
        new(NeteaseMusicProvider.Id, "网易云音乐", status == "ready" ? netease.Status : "degraded", ["search", "resolve", "recommendations"], true);

    public Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct) =>
        netease.SearchAsync(query, limit, cursor, ct);

    public async Task<MusicRecommendationPage> RecommendAsync(int? limit, string? cursor, CancellationToken ct)
    {
        var page = await netease.SearchAsync(options.NeteaseRecommendationQuery, limit, cursor, ct);
        return new MusicRecommendationPage(page.Items.Where(x => x.Availability != "unavailable").ToArray(),
            page.NextCursor, "netease_search_candidates", clock.GetUtcNow().UtcDateTime);
    }

    public Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct) =>
        netease.ResolveAsync(request, ct);
}
