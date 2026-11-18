namespace Meowv.Api.Modules.XiaomiCamera;

public sealed record XiaomiPlaybackPreparation(string Status, string? Error, bool AudioAvailable)
{
    public static XiaomiPlaybackPreparation Stopped { get; } = new("stopped", null, false);
}