namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioVerifyEmailRequest
{
    public string Token { get; set; } = string.Empty;
}