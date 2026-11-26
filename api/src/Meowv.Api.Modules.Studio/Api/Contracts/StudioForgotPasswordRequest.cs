namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioForgotPasswordRequest
{
    public string Email { get; set; } = string.Empty;
}