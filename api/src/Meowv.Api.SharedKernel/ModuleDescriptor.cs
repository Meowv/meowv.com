namespace Meowv.Api.SharedKernel;

public sealed record ModuleDescriptor(string Name, string Description, EndpointDescriptor[] Endpoints);