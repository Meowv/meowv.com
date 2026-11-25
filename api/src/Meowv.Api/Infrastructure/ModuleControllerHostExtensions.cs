using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using MvcJsonOptions = Microsoft.AspNetCore.Mvc.JsonOptions;
using HttpJsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;

namespace Meowv.Api.Infrastructure;

public static class ModuleControllerHostExtensions
{
    /// <summary>MVC 宿主接入：保留源生成 JSON、关闭自动 400、附加模块元数据约定。</summary>
    public static IServiceCollection AddApiControllers(this IServiceCollection services)
    {
        services.AddControllers();
        services.Configure<ApiBehaviorOptions>(options => options.SuppressModelStateInvalidFilter = true);
        services.AddSingleton<IConfigureOptions<MvcOptions>, ConfigureModuleMvcOptions>();
        services.AddSingleton<IPostConfigureOptions<MvcJsonOptions>, SyncMvcJsonOptions>();
        return services;
    }

    public static ControllerActionEndpointConventionBuilder MapApiControllers(this IEndpointRouteBuilder endpoints)
        => endpoints.MapControllers();
}

internal sealed class ConfigureModuleMvcOptions(IServiceProvider services) : IConfigureOptions<MvcOptions>
{
    public void Configure(MvcOptions options)
        => options.Conventions.Add(new ModuleEndpointMetadataConvention(services));
}

/// <summary>Minimal API 与 MVC 的 JSON 配置互不共享，需把源生成 Context 同步到 MVC 侧。</summary>
internal sealed class SyncMvcJsonOptions(IOptions<HttpJsonOptions> http) : IPostConfigureOptions<MvcJsonOptions>
{
    public void PostConfigure(string? name, MvcJsonOptions options)
    {
        foreach (var resolver in http.Value.SerializerOptions.TypeInfoResolverChain)
            if (!options.JsonSerializerOptions.TypeInfoResolverChain.Contains(resolver))
                options.JsonSerializerOptions.TypeInfoResolverChain.Add(resolver);
    }
}
