namespace Meowv.Api.Platform.Hosting;

public abstract class EndpointMetadataAttribute(string metadataTypeName) : Attribute
{
    public string MetadataTypeName { get; } = metadataTypeName;
}