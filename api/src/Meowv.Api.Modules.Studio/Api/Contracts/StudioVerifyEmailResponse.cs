namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioVerifyEmailResponse
{
    public string Message { get; set; } = string.Empty;

    public StudioUserProfileResponse User { get; set; } = new();
}