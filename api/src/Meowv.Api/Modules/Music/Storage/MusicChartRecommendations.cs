using System.Threading.Channels;
using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music.Storage;

internal sealed class MusicChartRecommendations(
    QQMusicChart chart,
    MusicCatalog catalog,
    TimeProvider clock,
    ILogger<MusicChartRecommendations> logger) : BackgroundService
{
    private sealed record MatchedChart(
        MusicChartPage Page,
        string ProviderVersion,
        DateTimeOffset ExpiresAt,
        MusicTrack[] Items);

    private readonly Channel<bool> _requests = Channel.CreateBounded<bool>(new BoundedChannelOptions(1)
    {
        SingleReader = true,
        FullMode = BoundedChannelFullMode.DropWrite
    });

    private MatchedChart? _matches;

    public MusicRecommendationPage Mix(MusicRecommendationPage page, int limit)
    {
        _requests.Writer.TryWrite(true);
        var matches = Volatile.Read(ref _matches);
        if (!Usable(matches, clock.GetUtcNow())) return page;

        var ranked = matches!.Items.Take(limit).ToArray();
        var items = ranked.Concat(page.Items.Where(candidate => !ranked.Any(entry => entry.Id == candidate.Id || MusicCandidateMatcher.CanMerge(entry, candidate)))).Take(limit).ToArray();
        return page with { Items = items, Strategy = "qq_rising_verified_and_" + page.Strategy };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var nextAttempt = DateTimeOffset.MinValue;
        await foreach (var _ in _requests.Reader.ReadAllAsync(stoppingToken))
        {
            var now = clock.GetUtcNow();
            if (now < nextAttempt) continue;
            var existing = Volatile.Read(ref _matches);
            if (Usable(existing, now)) continue;
            nextAttempt = now.AddMinutes(15);

            try
            {
                var snapshot = await chart.GetAsync(false, stoppingToken);
                if (snapshot.Stale) continue;
                var version = catalog.Version;
                var items = new List<MusicTrack>(2);
                using var budget = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                budget.CancelAfter(TimeSpan.FromSeconds(5));
                try
                {
                    foreach (var entry in snapshot.Entries.Where(x => x.DurationMs > 0).Take(4))
                    {
                        var match = await catalog.MatchChartEntryAsync(entry, budget.Token);
                        if (match is not null && !items.Any(x => x.Id == match.Id || MusicCandidateMatcher.CanMerge(x, match)))
                            items.Add(match);
                        if (items.Count == 2) break;
                    }
                }
                catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
                {
                }

                if (items.Count > 0 && chart.IsCurrent(snapshot))
                    Volatile.Write(ref _matches, new MatchedChart(snapshot, version, clock.GetUtcNow().AddMinutes(20), [.. items]));
            }
            catch (MusicException)
            {
                // 榜单故障与普通推荐独立，下一次按需请求可以重试。
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                logger.LogWarning("音乐榜单候选生成失败 ({ErrorType})。", error.GetType().Name);
            }
        }
    }

    private bool Usable(MatchedChart? value, DateTimeOffset now) => value is not null && value.ExpiresAt > now && value.ProviderVersion == catalog.Version && chart.IsCurrent(value.Page);
}