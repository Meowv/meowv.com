namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioSessionContext
{
    public StudioSession Session { get; set; } = new();

    public StudioUser User { get; set; } = new();
}