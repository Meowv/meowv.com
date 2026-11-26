namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioLoginRequest
{
    public string Identifier { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;
}