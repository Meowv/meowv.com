using System.Net;
using Meowv.Api.Infrastructure;

namespace Meowv.Api.Modules.Music;

// 本机开发专用，只开放两条已授权测试片段，不提供目录或任意路径读取。
public sealed class MusicDemoMedia(MusicOptions options, ApiPaths paths)
{
    public bool Configured => !string.IsNullOrWhiteSpace(options.DemoMediaDirectory);
    public bool Valid
    {
        get
        {
            try { return Configured && ValidBase(options.DemoMediaBaseUrl) && Names.All(name => File.Exists(Path.Combine(paths.Resolve(options.DemoMediaDirectory), name))); }
            catch (Exception error) when (error is ArgumentException or IOException or UnauthorizedAccessException) { return false; }
        }
    }
    private static readonly string[] Names = ["original-001.mp3", "original-002.mp3"];
    public string? PathFor(string name) => Valid && Names.Contains(name, StringComparer.Ordinal)
        ? Path.Combine(paths.Resolve(options.DemoMediaDirectory), name) : null;
    public string Url(int index) => options.DemoMediaBaseUrl.TrimEnd('/') + "/demo-audio/" + Names[index];
    private static bool ValidBase(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "http" || uri.UserInfo.Length != 0 || uri.Query.Length != 0 || uri.Fragment.Length != 0 || !uri.AbsolutePath.TrimEnd('/').EndsWith("/api/music", StringComparison.Ordinal)) return false;
        if (uri.Host == "localhost") return true;
        if (!IPAddress.TryParse(uri.Host, out var ip)) return false;
        var bytes = ip.GetAddressBytes();
        return IPAddress.IsLoopback(ip) || bytes.Length == 4 && (bytes[0] == 10 || bytes[0] == 192 && bytes[1] == 168 || bytes[0] == 172 && bytes[1] is >= 16 and <= 31);
    }
}
