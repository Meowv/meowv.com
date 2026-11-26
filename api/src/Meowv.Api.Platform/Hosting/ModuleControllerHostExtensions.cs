using System.Reflection;
using Microsoft.AspNetCore.Mvc;
using MvcJsonOptions = Microsoft.AspNetCore.Mvc.JsonOptions;

namespace Meowv.Api.Platform.Hosting;

public static class ModuleControllerHostExtensions
{
    public static IServiceCollection AddApiControllers(this IServiceCollection services, params Assembly[] parts)
    {
        var mvc = services.AddControllers();
        foreach (var part in parts.Distinct()) mvc.AddApplicationPart(part);
        services.Configure<ApiBehaviorOptions>(options => options.SuppressModelStateInvalidFilter = true);
        services.AddSingleton<IConfigureOptions<MvcOptions>, ConfigureModuleMvcOptions>();
        services.AddSingleton<IPostConfigureOptions<MvcJsonOptions>, SyncMvcJsonOptions>();
        return services;
    }

    public static ControllerActionEndpointConventionBuilder MapApiControllers(this IEndpointRouteBuilder endpoints) => endpoints.MapControllers();
}