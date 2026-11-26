namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioDeleteAccountRequest
{
    public string Password { get; set; } = string.Empty;
}