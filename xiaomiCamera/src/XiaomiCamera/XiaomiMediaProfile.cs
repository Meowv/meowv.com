namespace XiaomiCamera;

/// <summary>服务支持的媒体资源档位。分辨率和码率是上限，低分辨率源不会被放大。</summary>
public sealed record XiaomiMediaProfile(string Name, int MaximumWidth, int MaximumHeight, int MaximumFramesPerSecond, int TargetBitrateKbps, int PeakBitrateKbps, string EncoderPreset)
{
    public static XiaomiMediaProfile Server { get; } = new("server", 1280, 720, 15, 1000, 1500, "ultrafast");

    public static XiaomiMediaProfile Development { get; } = new("development", 1920, 1080, 25, 3000, 5000, "veryfast");

    public static XiaomiMediaProfile Resolve(string? name) => name?.Trim().ToLowerInvariant() switch
    {
        null or "" or "server" => Server,
        "development" => Development,
        _ => throw new InvalidOperationException("media.profile 仅支持 server 或 development。"),
    };
}