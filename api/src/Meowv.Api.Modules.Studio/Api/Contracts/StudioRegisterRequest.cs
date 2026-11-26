namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioRegisterRequest
{
    public string Username { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;
}