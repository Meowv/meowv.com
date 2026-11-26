namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioAuthSession
{
    public string Token { get; set; } = string.Empty;

    public DateTimeOffset ExpiresAt { get; set; }

    public StudioUser User { get; set; } = new();
}