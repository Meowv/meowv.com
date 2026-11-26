namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioLayoutPutResult
{
    public StudioLayoutPutStatus Status { get; set; }

    public StudioLayout? Current { get; set; }
}