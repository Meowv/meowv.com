namespace Meowv.Api.Core;

public sealed record EndpointDescriptor(string Path, string[] Methods, string Authorization);