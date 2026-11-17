using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;

namespace Meowv.Api.Modules.Music;

public sealed class MusicCatalog(MusicOptions options, FakeMusicProvider demo, NeteaseMusicProvider netease, TimeProvider clock)
{
    public string Version => options.NeteaseEnabled ? NeteaseMusicProvider.ConfigVersion : FakeMusicProvider.ConfigVersion;

    public MusicProvider Provider(string status) => options.NeteaseEnabled
        ? new(NeteaseMusicProvider.Id, "网易云音乐", status == "ready" ? "healthy" : "degraded", ["search", "resolve", "recommendations"], true)
        : new(FakeMusicProvider.Id, "原创测试音频", status == "ready" ? "healthy" : "degraded", ["search", "resolve", "recommendations"], false);

    public Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct) =>
        options.NeteaseEnabled ? netease.SearchAsync(query, limit, cursor, ct) : Task.FromResult(demo.Search(query, limit, cursor));

    public async Task<MusicRecommendationPage> RecommendAsync(int? limit, string? cursor, CancellationToken ct)
    {
        if (!options.NeteaseEnabled) return demo.Recommend(limit, cursor);
        var page = await netease.SearchAsync(options.NeteaseRecommendationQuery, limit, cursor, ct);
        return new MusicRecommendationPage(page.Items.Where(x => x.Availability != "unavailable").ToArray(),
            page.NextCursor, "netease_search_candidates", clock.GetUtcNow().UtcDateTime);
    }

    public Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct) =>
        options.NeteaseEnabled ? netease.ResolveAsync(request, ct) : Task.FromResult(demo.Resolve(request));
}
