namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioSetRoleResponse
{
    public Guid Id { get; set; }

    public string Role { get; set; } = string.Empty;

    public long Revision { get; set; }
}