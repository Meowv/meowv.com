namespace Meowv.Api.Platform.Hosting;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class MusicProtectedAttribute() : EndpointMetadataAttribute("Meowv.Api.Modules.Music.Api.MusicProtectedEndpoint");