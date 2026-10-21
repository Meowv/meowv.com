using Meowv.Api.Core;
using Microsoft.AspNetCore.Authorization;

namespace Meowv.Api.Modules.Diagnostics;

public sealed class DiagnosticsModule : IEndpointModule
{
    public string Name => "diagnostics";

    public string Description => "已加载模块与接口目录。";

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        var modules = endpoints.ServiceProvider.GetServices<IEndpointModule>()
            .OrderBy(module => module.Name, StringComparer.Ordinal)
            .ToArray();

        endpoints.MapGet("/api/modules", (HttpContext context, EndpointDataSource source) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var routes = source.Endpoints.OfType<RouteEndpoint>().ToArray();
            var catalog = modules.Select(module => new ModuleDescriptor(module.Name, module.Description,
                    routes.Where(route => route.Metadata.GetMetadata<EndpointModuleMetadata>()?.Name == module.Name)
                        .Select(route => new EndpointDescriptor(
                            route.RoutePattern.RawText ?? route.RoutePattern.ToString() ?? "/",
                            route.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods.Order(StringComparer.Ordinal).ToArray() ?? ["ANY"],
                            DescribeAuthorization(route)))
                        .OrderBy(route => route.Path, StringComparer.Ordinal)
                        .ThenBy(route => string.Join(',', route.Methods), StringComparer.Ordinal)
                        .ToArray()))
                .ToArray();
            return Results.Json(catalog, ApiJsonContext.Default.ModuleDescriptorArray);
        }).AllowAnonymous();

        endpoints.MapGet("/api/docs", (HttpContext context) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            return Results.Content(EndpointCatalogPage.Html, "text/html; charset=utf-8");
        }).AllowAnonymous();
    }

    private static string DescribeAuthorization(RouteEndpoint endpoint)
    {
        var requirements = new List<string>();
        var allowAnonymous = endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null;
        IReadOnlyList<IAuthorizeData> authorization = allowAnonymous ? [] : endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>();
        if (authorization.Any(data => data.Policy == ApiAuthorization.ManagementPolicy ||
                data.AuthenticationSchemes?.Split(',').Any(scheme => scheme.Trim() == ApiAuthorization.ManagementScheme) == true))
            requirements.Add("管理密钥");
        else if (authorization.Any(data => string.IsNullOrEmpty(data.Policy) && string.IsNullOrEmpty(data.AuthenticationSchemes)))
            requirements.Add("通用授权码");

        foreach (var data in authorization)
        {
            if (!string.IsNullOrEmpty(data.Policy) && data.Policy != ApiAuthorization.ManagementPolicy)
                requirements.Add("策略：" + data.Policy);
            if (!string.IsNullOrEmpty(data.AuthenticationSchemes) && data.AuthenticationSchemes != ApiAuthorization.ManagementScheme)
                requirements.Add("认证：" + data.AuthenticationSchemes);
            if (!string.IsNullOrEmpty(data.Roles)) requirements.Add("角色：" + data.Roles);
        }
        foreach (var access in endpoint.Metadata.GetOrderedMetadata<EndpointAccessMetadata>())
            requirements.Add(access.Requirement);
        if (!allowAnonymous && endpoint.Metadata.GetOrderedMetadata<AuthorizationPolicy>().Count > 0)
            requirements.Add("授权策略");
        return requirements.Count == 0 ? "匿名" : string.Join(" + ", requirements.Distinct(StringComparer.Ordinal));
    }
}
