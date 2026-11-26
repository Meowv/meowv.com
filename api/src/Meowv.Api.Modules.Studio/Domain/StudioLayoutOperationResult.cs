namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioLayoutOperationResult
{
    public StudioLayoutPutStatus Status { get; set; }

    public LayoutEnvelope Envelope { get; set; } = new();
}