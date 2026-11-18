using System.Globalization;
using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music.Providers;

public sealed class IncompetechMusicProvider : IMusicSearchProvider, IMusicResolverProvider
{
    public const string Id = "incompetech";
    public string ProviderId => Id;
    public string DisplayName => "Incompetech";
    public string Version => "incompetech-v1";
    public string Status => "healthy";

    private const string Artist = "Kevin MacLeod";
    private const string AudioRoot = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/";

    // 仅收录作者站逐首标注 CC BY 4.0 的原版录音，搜索和解析都限于此清单。
    private static readonly MusicTrack[] Tracks =
    [
        Track("USUAN1400011", "Monkeys Spinning Monkeys", "Comedic (Film Scoring Moods)", 125),
        Track("USUAN1100772", "Sneaky Snitch", "Comedic (Film Scoring Moods)", 137),
        Track("USUAN1200002", "Overcast", "Disco and Lounge (Electronic and Rock)", 228),
        Track("USUAN1500085", "Final Battle of the Dark Wizards", "Darkness and Unease (Film Scoring Moods)", 272)
    ];

    public MusicTrack? FindTrack(string id)
    {
        var track = Array.Find(Tracks, x => x.Id == id);
        return track is null ? null : track with { Artists = [.. track.Artists], Sources = [.. track.Sources] };
    }

    public Task<MusicSearchPage> SearchAsync(string? query, int? limit, string? cursor, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var count = limit ?? 20;
        if (string.IsNullOrWhiteSpace(query) || count is < 1 or > 50) throw MusicException.Invalid();
        var offset = 0;
        if (cursor is not null && (!int.TryParse(cursor, NumberStyles.None, CultureInfo.InvariantCulture, out offset) ||
            offset < 1 || offset >= Tracks.Length)) throw MusicException.Invalid();
        var terms = query.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        var matches = Tracks.Where(x => query.Trim() == "纯音乐" ||
            terms.All(term => $"{x.Title} {Artist} {x.Album} {x.Isrc}".Contains(term, StringComparison.OrdinalIgnoreCase))).ToArray();
        var items = matches.Skip(offset).Take(count).Select(x => FindTrack(x.Id)!).ToArray();
        var next = offset + items.Length;
        return Task.FromResult(new MusicSearchPage(items, next < matches.Length ? next.ToString(CultureInfo.InvariantCulture) : null, false, []));
    }

    public Task<MusicResolvedTrack> ResolveAsync(MusicResolveRequest request, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (request.Quality != "auto") throw MusicException.Invalid();
        if (request.PreferredProviderId is not null && request.PreferredProviderId != Id)
            throw new MusicException("forbidden", "此音乐源未启用。", 403);
        var track = Array.Find(Tracks, x => x.Id == request.TrackId)
                    ?? throw new MusicException("track_not_found", "歌曲不在研究目录中。", 404);
        var url = AudioRoot + Uri.EscapeDataString(track.Title) + ".mp3";
        return Task.FromResult(new MusicResolvedTrack(track.Id, Id, track.Isrc!, 1,
            new MusicAudio(url, "audio/mpeg", track.DurationMs, null, true)));
    }

    private static MusicTrack Track(string isrc, string title, string album, int seconds) =>
        new("ic-" + isrc, title, [Artist], album, seconds * 1000L, null, isrc, "candidate", [new(Id, isrc)]);
}
