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
        var (key, defaultEnabled) = source.ProviderId switch
        {
            NeteaseMusicProvider.Id => (nameof(MusicOptions.NeteaseEnabled), options.NeteaseEnabled),
            KuwoSearchProvider.Id => (nameof(MusicOptions.KuwoSearchEnabled), options.KuwoSearchEnabled),
            IncompetechMusicProvider.Id => (nameof(MusicOptions.IncompetechEnabled), options.IncompetechEnabled),
            _ => ("", false)
        };
        if (key.Length == 0) return false;
        var value = configuration["Modules:Music:" + key];
        return value is not null ? bool.TryParse(value, out var enabled) && enabled : defaultEnabled;
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
            x is IMusicResolverProvider ? ["search", "resolve", "recommendations"] : ["search"], x is IMusicResolverProvider))
    ];
}
