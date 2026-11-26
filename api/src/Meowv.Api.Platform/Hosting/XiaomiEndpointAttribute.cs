namespace Meowv.Api.Platform.Hosting;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class XiaomiEndpointAttribute() : EndpointMetadataAttribute("Meowv.Api.Modules.XiaomiCamera.Api.XiaomiEndpointMetadata");