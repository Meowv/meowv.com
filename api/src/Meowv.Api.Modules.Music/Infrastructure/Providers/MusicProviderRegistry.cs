using System.Security.Cryptography;
using System.Text;

namespace Meowv.Api.Modules.Music.Infrastructure.Providers;

public sealed class MusicProviderRegistry(MusicOptions options, IEnumerable<IMusicSearchProvider> sources)
{
    private readonly IMusicSearchProvider[] _sources = [.. sources];
    public IMusicSearchProvider[] Enabled => [.. _sources.Where(IsEnabled)];

    public bool IsEnabled(IMusicSearchProvider source) => options.Enabled && _sources.Contains(source);

    public string Version
    {
        get
        {
            var enabled = Enabled;
            if (enabled.Length == 1) return enabled[0].Version;
            var text = string.Join('|', enabled.Select(x => x.ProviderId + ":" + x.Version));
            return "catalog-v2-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)))[..12].ToLowerInvariant();
        }
    }

    public MusicProvider[] Describe() =>
    [
        .. _sources.Select(x => new MusicProvider(x.ProviderId, x.DisplayName,
            !IsEnabled(x) ? "disabled" : x.Status,
            Capabilities(x), x is IMusicResolverProvider))
    ];

    private static string[] Capabilities(IMusicSearchProvider source)
    {
        var capabilities = new List<string> { "search" };
        if (source is IMusicResolverProvider) capabilities.Add("resolve");
        if (source is IMusicLyricsProvider) capabilities.Add("lyrics");
        if (source is NeteaseMusicProvider or QQMusicProvider) capabilities.AddRange(["charts", "recommendations"]);
        return capabilities.ToArray();
    }
}
