namespace Meowv.Api.Core;

/// <summary>标记在标准认证之外，由模块自行校验的访问凭据。</summary>
public sealed record EndpointAccessMetadata(string Requirement);