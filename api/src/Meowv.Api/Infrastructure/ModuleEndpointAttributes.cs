namespace Meowv.Api.Infrastructure;

/// <summary>声明控制器所属模块；OptionsType/RuntimeType 用于复刻 MapEndpoints 中的门控判断。</summary>
[AttributeUsage(AttributeTargets.Class)]
public sealed class EndpointModuleAttribute(string name) : Attribute
{
    public string Name { get; } = name;

    public Type? OptionsType { get; init; }

    public Type? RuntimeType { get; init; }
}

/// <summary>模块自行校验的访问凭据，注入 EndpointAccessMetadata。</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class EndpointAccessAttribute(string requirement) : Attribute
{
    public string Requirement { get; } = requirement;
}

/// <summary>模块禁用时仍保留的健康探针。</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class ModuleHealthAttribute : Attribute;

/// <summary>模块已启用但运行时未就绪时移除的端点。</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class ModuleReadyAttribute : Attribute;

/// <summary>标记需要注入的模块专属元数据；类型名字符串避免宿主编译期强引用模块类型。</summary>
public abstract class EndpointMetadataAttribute(string metadataTypeName) : Attribute
{
    public string MetadataTypeName { get; } = metadataTypeName;
}

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class MusicProtectedAttribute()
    : EndpointMetadataAttribute("Meowv.Api.Modules.Music.MusicProtectedEndpoint");

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class XiaomiEndpointAttribute()
    : EndpointMetadataAttribute("Meowv.Api.Modules.XiaomiCamera.XiaomiEndpointMetadata");
