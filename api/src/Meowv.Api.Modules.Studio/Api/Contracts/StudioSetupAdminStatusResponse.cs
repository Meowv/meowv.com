namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioSetupAdminStatusResponse
{
    public StudioSetupAdminStatusResponse()
    {
    }

    public StudioSetupAdminStatusResponse(bool adminExists)
    {
        AdminExists = adminExists;
    }

    public bool AdminExists { get; set; }
}