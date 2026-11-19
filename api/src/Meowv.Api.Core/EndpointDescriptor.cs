namespace Meowv.Api.Core;

public sealed record EndpointDescriptor(string Path, string Description, string[] Methods, string Authorization);