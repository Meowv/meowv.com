namespace Meowv.Api.Core;

public sealed record ModuleDescriptor(string Name, string Description, EndpointDescriptor[] Endpoints);

public sealed record EndpointDescriptor(string Path, string[] Methods, string Authorization);

public sealed record EndpointModuleMetadata(string Name);

/// <summary>标记在标准认证之外，由模块自行校验的访问凭据。</summary>
public sealed record EndpointAccessMetadata(string Requirement);
