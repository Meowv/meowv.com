namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioUser
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public string Username { get; set; } = string.Empty;

    public string UsernameLower { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public StudioUserRole Role { get; set; } = StudioUserRole.User;

    public bool EmailVerified { get; set; }

    public DateTimeOffset? EmailVerifiedAt { get; set; }

    public string? AvatarPath { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public long Revision { get; set; }
}