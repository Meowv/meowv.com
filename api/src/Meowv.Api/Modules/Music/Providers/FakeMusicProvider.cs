using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Meowv.Api.Modules.Music.Contracts;
using Microsoft.AspNetCore.WebUtilities;

namespace Meowv.Api.Modules.Music.Providers;

public interface IMusicSearcher
{
    MusicSearchPage Search(string? query, int? limit, string? cursor);
}

public interface IRecommendationSource
{
    MusicRecommendationPage Recommend(int? limit, string? cursor);
}

public interface ITrackResolver
{
    MusicResolvedTrack Resolve(MusicResolveRequest request);
}

public sealed class FakeMusicProvider(MusicOptions options, MusicRuntime runtime, TimeProvider clock, MusicDemoMedia media) : IMusicSearcher, IRecommendationSource, ITrackResolver
{
    public const string Id = "original-demo";
    public const string ConfigVersion = "fake-v1";

    private static readonly MusicTrack[] Tracks =
    [
        new("original-001", "睡醒就好了（测试片段）", ["qix"], "今天也不错", 12000, null, null, "candidate", [new(Id, "001")]),
        new("original-002", "今天也不错（测试片段）", ["qix"], "今天也不错", 12000, null, null, "candidate", [new(Id, "002")]),
    ];

    public MusicSearchPage Search(string? query, int? limit, string? cursor)
    {
        if (query is null || query.Any(char.IsControl) || query.Trim().Length is < 1 or > 100)
            throw MusicException.Invalid();
        var normalized = query.Trim().Normalize(NormalizationForm.FormKC).ToUpperInvariant();
        var items = Tracks.Where(track => (track.Title + " " + string.Join(' ', track.Artists) + " " + track.Album)
            .Normalize(NormalizationForm.FormKC).ToUpperInvariant().Contains(normalized, StringComparison.Ordinal)).ToArray();
        var (page, next) = Page(items, limit, cursor, "search:" + normalized);
        return new MusicSearchPage(page, next, false, []);
    }

    public MusicRecommendationPage Recommend(int? limit, string? cursor)
    {
        var (items, next) = Page(Tracks, limit, cursor, "recommendations");
        return new MusicRecommendationPage(items, next, "demo_catalog", clock.GetUtcNow().UtcDateTime);
    }

    public MusicResolvedTrack Resolve(MusicResolveRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TrackId) || request.TrackId.Length > 128 || request.Quality != "auto")
            throw MusicException.Invalid();
        if (request.PreferredProviderId is not null && request.PreferredProviderId != Id)
            throw new MusicException("forbidden", "此音乐源未启用。", 403);
        var index = Array.FindIndex(Tracks, track => track.Id == request.TrackId);
        if (index < 0) throw new MusicException("track_not_found", "歌曲不存在。", 404);
        if (media.Valid)
            return new MusicResolvedTrack(Tracks[index].Id, Id, Tracks[index].Sources[0].SourceTrackId, 1,
                new MusicAudio(media.Url(index), "audio/mpeg", Tracks[index].DurationMs, null, true));
        if (index >= options.DemoAudioUrls.Length)
            throw new MusicException("source_unavailable", "测试音频地址尚未配置。", 503);
        var url = options.DemoAudioUrls[index];
        if (!runtime.IsAllowedAudio(url))
            throw new MusicException("source_unavailable", "测试音频地址不可用。", 503);

        return new MusicResolvedTrack(Tracks[index].Id, Id, Tracks[index].Sources[0].SourceTrackId, 1, new MusicAudio(url, "audio/mpeg", Tracks[index].DurationMs, null, true));
    }

    private static (MusicTrack[] Items, string? Next) Page(MusicTrack[] items, int? limit, string? cursor, string scope)
    {
        var count = limit ?? 20;
        if (count is < 1 or > 50) throw MusicException.Invalid();
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(scope)))[..16];
        var prefix = ConfigVersion + ":" + fingerprint + ":";
        var offset = 0;
        if (cursor is not null)
        {
            if (cursor.Length is < 1 or > 128) throw MusicException.Invalid();
            string decoded;
            try
            {
                decoded = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(cursor));
            }
            catch (FormatException)
            {
                throw MusicException.Invalid();
            }

            if (!decoded.StartsWith(prefix, StringComparison.Ordinal) ||
                !int.TryParse(decoded[prefix.Length..], NumberStyles.None, CultureInfo.InvariantCulture, out offset) ||
                offset < 1 || offset >= items.Length)
                throw MusicException.Invalid();
        }

        var page = items.Skip(offset).Take(count).ToArray();
        var nextOffset = offset + page.Length;
        return (page, nextOffset < items.Length
            ? WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(prefix + nextOffset.ToString(CultureInfo.InvariantCulture)))
            : null);
    }
}