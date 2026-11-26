namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioPreferences
{
    public Guid UserId { get; set; }

    public string Json { get; set; } = "{}";

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}