namespace Meowv.Api.Modules.Studio.Domain;

public interface IStudioClock
{
    DateTimeOffset UtcNow { get; }
}