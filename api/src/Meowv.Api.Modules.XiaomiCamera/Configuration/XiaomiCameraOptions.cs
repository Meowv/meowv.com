namespace Meowv.Api.Modules.XiaomiCamera.Configuration;

public sealed class XiaomiCameraOptions(IOptions<XiaomiModuleOptions> module, IOptions<FfmpegOptions> ffmpeg, ApiPaths paths)
{
    public int MaxConcurrentStreams { get; } = module.Value.MaxConcurrentStreams > 0
        ? module.Value.MaxConcurrentStreams
        : throw new InvalidOperationException("Modules:XiaomiCamera:MaxConcurrentStreams 必须大于 0。");

    public string? FfmpegPath { get; } = string.IsNullOrWhiteSpace(ffmpeg.Value.Path) ? null : paths.Resolve(ffmpeg.Value.Path);
    public string TempDirectory { get; } = Path.GetTempPath();
    public XiaomiMediaProfile MediaProfile { get; } = XiaomiMediaProfile.Resolve(module.Value.Media.Profile);
}