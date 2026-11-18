using System.Security.Cryptography;
using System.Text;
using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music.Providers;

public sealed class MusicProviderRegistry(MusicOptions options, IConfiguration configuration, IEnumerable<IMusicSearchProvider> sources)
{
    private readonly IMusicSearchProvider[] _sources = [.. sources];
    public IMusicSearchProvider[] Enabled => [.. _sources.Where(IsEnabled)];

    public bool IsEnabled(IMusicSearchProvider source)
    {
        if (source.ProviderId == QQMusicProvider.Id) return options.Enabled;
        if (source.ProviderId != NeteaseMusicProvider.Id) return false;
        var value = configuration["Modules:Music:" + nameof(MusicOptions.NeteaseEnabled)];
        return value is not null ? bool.TryParse(value, out var enabled) && enabled : options.NeteaseEnabled;
    }

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
