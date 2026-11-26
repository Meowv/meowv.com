namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioSystemClock : IStudioClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}