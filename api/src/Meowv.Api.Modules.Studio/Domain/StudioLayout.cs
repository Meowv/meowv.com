namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioLayout
{
    public Guid UserId { get; set; }

    public string Json { get; set; } = "{}";

    public long Revision { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}