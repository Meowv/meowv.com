using Microsoft.AspNetCore.Mvc.ApplicationModels;

namespace Meowv.Api.Platform.Hosting;

internal sealed class ModuleEndpointMetadataConvention(IServiceProvider services) : IApplicationModelConvention
{
    public void Apply(ApplicationModel application)
    {
        var configuration = services.GetService<IConfiguration>();
        var endpointModules = services.GetServices<IEndpointModule>().ToDictionary(module => module.Name, module => module, StringComparer.Ordinal);

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
        return runtime?.GetType().GetProperty("Available")?.GetValue(runtime) is true;
    }

    private static void InjectMarker(SelectorModel selector, string typeName)
    {
        var type = AppDomain.CurrentDomain.GetAssemblies().Select(assembly => assembly.GetType(typeName, throwOnError: false)).FirstOrDefault(candidate => candidate is not null);
        if (type is null) return;
        if (Activator.CreateInstance(type, nonPublic: true) is { } marker)
            selector.EndpointMetadata.Add(marker);
    }
}