namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioAdminUserRow
{
    public Guid Id { get; set; }

    public string Username { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public StudioUserRole Role { get; set; }

    public bool EmailVerified { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public long Revision { get; set; }

    public int SessionCount { get; set; }
}