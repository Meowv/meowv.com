namespace Meowv.Api.Core;

public sealed record ModuleDescriptor(string Name, string Description, EndpointDescriptor[] Endpoints);