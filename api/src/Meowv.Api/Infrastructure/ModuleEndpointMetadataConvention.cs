using System.Reflection;
using Meowv.Api.Core;
using Microsoft.AspNetCore.Mvc.ApplicationModels;

namespace Meowv.Api.Infrastructure;

/// <summary>
/// 把轻量 Attribute 转译为宿主原有的元数据 record 实例，并复刻 MapEndpoints 的模块门控。
/// 不直接引用模块专属标记类型，避免定向测试宿主（仅编译部分模块）出现编译期依赖。
/// </summary>
internal sealed class ModuleEndpointMetadataConvention(IServiceProvider services) : IApplicationModelConvention
{
    public void Apply(ApplicationModel application)
    {
        var configuration = services.GetService<IConfiguration>();
        var endpointModules = services.GetServices<IEndpointModule>()
            .ToDictionary(module => module.Name, module => module, StringComparer.Ordinal);

        foreach (var controller in application.Controllers)
        {
            var declaration = controller.Attributes.OfType<EndpointModuleAttribute>().SingleOrDefault();
            if (declaration is null) continue;

            var registered = endpointModules.ContainsKey(declaration.Name);
            var enabled = registered && IsEnabled(declaration, configuration);
            var ready = !registered || IsReady(declaration);

            for (var i = controller.Actions.Count - 1; i >= 0; i--)
            {
                var action = controller.Actions[i];
                var attributes = controller.Attributes.Concat(action.Attributes).ToArray();
                var isHealth = attributes.Any(attribute => attribute is ModuleHealthAttribute);
                var needsReady = attributes.Any(attribute => attribute is ModuleReadyAttribute);

                // 未注册的模块不产生任何端点；已注册但禁用只保留 health；未就绪移除 ready-gated 端点。
                if (!registered || (!enabled && !isHealth) || (enabled && !ready && !isHealth && needsReady))
                {
                    controller.Actions.RemoveAt(i);
                    continue;
                }

                foreach (var selector in action.Selectors)
                {
                    selector.EndpointMetadata.Add(new EndpointModuleMetadata(declaration.Name));
                    foreach (var attribute in attributes)
                    {
                        switch (attribute)
                        {
                            case EndpointAccessAttribute access:
                                selector.EndpointMetadata.Add(new EndpointAccessMetadata(access.Requirement));
                                break;
                            case EndpointMetadataAttribute marker:
                                InjectMarker(selector, marker.MetadataTypeName);
                                break;
                        }
                    }
                }
            }
        }
    }

    private bool IsEnabled(EndpointModuleAttribute declaration, IConfiguration? configuration)
    {
        if (declaration.OptionsType is not null)
        {
            var options = services.GetService(declaration.OptionsType);
            if (options?.GetType().GetProperty("Enabled")?.GetValue(options) is not bool enabled || !enabled)
                return false;
        }

        if (declaration.Name == "xiaomi-camera")
        {
            var value = configuration?["Modules:XiaomiCamera:Enabled"];
            if (string.Equals(value, "false", StringComparison.OrdinalIgnoreCase)) return false;
        }

        return true;
    }

    private bool IsReady(EndpointModuleAttribute declaration)
    {
        if (declaration.RuntimeType is null) return true;
        var runtime = services.GetService(declaration.RuntimeType);
        return runtime?.GetType().GetProperty("Available")?.GetValue(runtime) is bool available && available;
    }

    private static void InjectMarker(SelectorModel selector, string typeName)
    {
        var assembly = typeof(EndpointModuleAttribute).Assembly;
        var type = assembly.GetType(typeName, throwOnError: false);
        if (type is null) return;
        if (Activator.CreateInstance(type, nonPublic: true) is { } marker)
            selector.EndpointMetadata.Add(marker);
    }
}
