using System.Text;
using System.Text.RegularExpressions;
using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music;

public sealed record MusicMatch(double Confidence, bool Equivalent, string Edition);

public static partial class MusicCandidateMatcher
{
    public static bool CanMerge(MusicTrack left, MusicTrack right) => Title(left.Title) == Title(right.Title) && Compare(left, right).Equivalent;

    public static MusicMatch Compare(MusicTrack expected, MusicTrack candidate)
    {
        var (leftTitle, leftEdition) = Title(expected.Title);
        var (rightTitle, rightEdition) = Title(candidate.Title);
        if (leftEdition != rightEdition || leftEdition != "studio" && Normalize(expected.Title) != Normalize(candidate.Title)) return new(0, false, rightEdition);
        var leftArtists = expected.Artists.Select(Normalize).Where(x => x.Length > 0).ToHashSet(StringComparer.Ordinal);
        var rightArtists = candidate.Artists.Select(Normalize).Where(x => x.Length > 0).ToHashSet(StringComparer.Ordinal);
        var title = Similarity(leftTitle, rightTitle);
        var artist = leftArtists.Count == 0 || rightArtists.Count == 0 ? 0 : (double)leftArtists.Intersect(rightArtists).Count() / leftArtists.Union(rightArtists).Count();
        var durations = expected.DurationMs is > 0 && candidate.DurationMs is > 0;
        var difference = durations ? Math.Abs(expected.DurationMs!.Value - candidate.DurationMs!.Value) : long.MaxValue;
        var tolerance = durations ? Math.Max(2000, expected.DurationMs!.Value * .02) : 0;
        var duration = durations && difference <= tolerance ? 1d : 0d;
        var leftIsrc = Isrc(expected.Isrc);
        var rightIsrc = Isrc(candidate.Isrc);
        if (leftIsrc is not null && rightIsrc is not null && leftIsrc != rightIsrc) return new(0, false, rightEdition);
        var score = .55 * title + .30 * artist + .15 * duration;
        if (leftIsrc is not null && leftIsrc == rightIsrc) score = Math.Min(1, score + .02);
        var equivalent = title == 1 && artist == 1 && duration == 1 && score >= .96 &&
                         expected.Availability != "preview" && candidate.Availability != "preview";
        return new MusicMatch(Math.Round(score, 4), equivalent, rightEdition);
    }

    private static (string Title, string Edition) Title(string title)
    {
        var edition = new SortedSet<string>(StringComparer.Ordinal);
        var basic = Annotation().Replace(title, match =>
        {
            var kind = Edition(match.Groups[1].Value);
            if (kind.Length == 0) return match.Value;
            edition.UnionWith(kind.Split('+'));
            return " ";
        });
        var suffix = Suffix().Match(basic);
        if (suffix.Success)
        {
            edition.Add(Edition(suffix.Groups[1].Value));
            basic = basic[..suffix.Index];
        }

        return (Normalize(basic), edition.Count == 0 ? "studio" : string.Join('+', edition));
    }

    private static string Edition(string text)
    {
        var value = text.ToLowerInvariant();
        var kinds = new List<string>();
        if (VersionWord().Matches(value).Any(x => x.Value == "live") || value.Contains("现场", StringComparison.Ordinal) || value.Contains("演唱会", StringComparison.Ordinal)) kinds.Add("live");
        if (VersionWord().Matches(value).Any(x => x.Value == "remix") || value.Contains("重混", StringComparison.Ordinal)) kinds.Add("remix");
        if (VersionWord().Matches(value).Any(x => x.Value == "cover") || value.Contains("翻唱", StringComparison.Ordinal)) kinds.Add("cover");
        if (VersionWord().Matches(value).Any(x => x.Value == "instrumental") || value.Contains("伴奏", StringComparison.Ordinal) || value.Contains("纯音乐版", StringComparison.Ordinal)) kinds.Add("instrumental");
        kinds.Sort(StringComparer.Ordinal);
        return string.Join('+', kinds);
    }

    private static string Normalize(string value) => string.Concat(value.Normalize(NormalizationForm.FormKC)
        .ToLowerInvariant().Where(char.IsLetterOrDigit));

    private static string? Isrc(string? value)
    {
        if (value is null) return null;
        var normalized = string.Concat(value.ToUpperInvariant().Where(char.IsLetterOrDigit));
        return ValidIsrc().IsMatch(normalized) ? normalized : null;
    }

    private static double Similarity(string left, string right)
    {
        if (left.Length == 0 || right.Length == 0) return 0;
        if (left == right) return 1;
        var previous = Enumerable.Range(0, right.Length + 1).ToArray();
        for (var i = 1; i <= left.Length; i++)
        {
            var current = new int[right.Length + 1];
            current[0] = i;
            for (var j = 1; j <= right.Length; j++)
                current[j] = Math.Min(Math.Min(current[j - 1] + 1, previous[j] + 1),
                    previous[j - 1] + (left[i - 1] == right[j - 1] ? 0 : 1));
            previous = current;
        }

        return 1d - (double)previous[right.Length] / Math.Max(left.Length, right.Length);
    }

    [GeneratedRegex(@"[\(\[（【]([^\)\]）】]+)[\)\]）】]", RegexOptions.CultureInvariant)]
    private static partial Regex Annotation();

    [GeneratedRegex(@"\s[-–—]\s*(live|remix|cover|instrumental|现场版|伴奏版|翻唱版)\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Suffix();

    [GeneratedRegex(@"\b(live|cover|remix|instrumental)\b", RegexOptions.CultureInvariant)]
    private static partial Regex VersionWord();

    [GeneratedRegex(@"^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$", RegexOptions.CultureInvariant)]
    private static partial Regex ValidIsrc();
}