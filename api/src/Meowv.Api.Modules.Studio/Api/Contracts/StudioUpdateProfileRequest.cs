namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioUpdateProfileRequest
{
    public string? Username { get; set; }

    public string? Email { get; set; }
}