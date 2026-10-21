using Meowv.Api.Infrastructure;
using Microsoft.Extensions.Options;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>由公共配置提供的模块选项；只在模块启用时绑定和校验。</summary>
public sealed class XiaomiModuleOptions
{
    public bool Enabled { get; set; } = true;
    public int MaxConcurrentStreams { get; set; } = 2;
    public XiaomiMediaOptions Media { get; set; } = new();
}

public sealed class XiaomiMediaOptions
{
    public string Profile { get; set; } = "server";
}

public sealed class XiaomiCameraOptions(IOptions<XiaomiModuleOptions> module, IOptions<FfmpegOptions> ffmpeg, ApiPaths paths)
{
    public int MaxConcurrentStreams { get; } = module.Value.MaxConcurrentStreams > 0
        ? module.Value.MaxConcurrentStreams
        : throw new InvalidOperationException("Modules:XiaomiCamera:MaxConcurrentStreams 必须大于 0。");

    public string? FfmpegPath { get; } = string.IsNullOrWhiteSpace(ffmpeg.Value.Path) ? null : paths.Resolve(ffmpeg.Value.Path);
    public string TempDirectory { get; } = Path.GetTempPath();
    public XiaomiMediaProfile MediaProfile { get; } = XiaomiMediaProfile.Resolve(module.Value.Media.Profile);
}