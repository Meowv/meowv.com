namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioLayoutWriteRequest
{
    public DesktopLayout? Layout { get; set; }

    public long Revision { get; set; }
}