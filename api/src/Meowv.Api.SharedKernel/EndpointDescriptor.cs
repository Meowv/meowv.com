namespace Meowv.Api.SharedKernel;

public sealed record EndpointDescriptor(string Path, string Description, string[] Methods, string Authorization);