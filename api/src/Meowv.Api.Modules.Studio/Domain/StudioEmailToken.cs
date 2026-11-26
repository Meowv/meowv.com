namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioEmailToken
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public StudioEmailTokenPurpose Purpose { get; set; }

    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? UsedAt { get; set; }

    public bool IsUsable(DateTimeOffset now)
    {
        return UsedAt is null && ExpiresAt > now;
    }
}