namespace Meowv.Api.Modules.XiaomiCamera.Api;

public sealed record XiaomiPlaybackPreparation(string Status, string? Error, bool AudioAvailable)
{
    public static XiaomiPlaybackPreparation Stopped { get; } = new("stopped", null, false);
}