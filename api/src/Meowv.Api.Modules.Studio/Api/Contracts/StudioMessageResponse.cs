namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioMessageResponse
{
    public StudioMessageResponse()
    {
    }

    public StudioMessageResponse(string message)
    {
        Message = message;
    }

    public string Message { get; set; } = string.Empty;
}