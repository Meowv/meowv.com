using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Mvc;

namespace Meowv.Api.Modules.Diagnostics.Api;

[ApiController]
[EndpointModule("diagnostics")]
public sealed class DiagnosticsController : ControllerBase
{
    private static readonly string[] AnyMethod = ["ANY"];

    [HttpGet("/api/modules")]
    [AllowAnonymous]
    [EndpointSummary("以 JSON 返回已加载模块与接口清单，含路径、描述、请求方式与认证要求。")]
    public IResult Modules([FromServices] EndpointDataSource source)
    {
        HttpContext.Response.Headers.CacheControl = "no-store";
        var modules = HttpContext.RequestServices.GetServices<IEndpointModule>().OrderBy(module => module.Name, StringComparer.Ordinal).ToArray();
        var routes = source.Endpoints.OfType<RouteEndpoint>().ToArray();
        var catalog = modules.Select(module => new ModuleDescriptor(module.Name, module.Description, [
            .. routes.Where(route => route.Metadata.GetMetadata<EndpointModuleMetadata>()?.Name == module.Name)
                .Select(route => new EndpointDescriptor(
                    NormalizePath(route.RoutePattern.RawText ?? route.RoutePattern.ToString() ?? "/"),
                    route.Metadata.GetMetadata<IEndpointSummaryMetadata>()?.Summary ?? "",
                    route.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods.Order(StringComparer.Ordinal).ToArray() ?? AnyMethod,
                    DescribeAuthorization(route)))
                .OrderBy(route => route.Path, StringComparer.Ordinal)
                .ThenBy(route => string.Join(',', route.Methods), StringComparer.Ordinal)
        ])).ToArray();
        return Results.Json(catalog, ApiJsonContext.Default.ModuleDescriptorArray);
    }

    [HttpGet("/api/docs")]
    [AllowAnonymous]
    [EndpointSummary("浏览器可读的接口目录页面，支持搜索与按模块筛选。")]
    public IResult Docs()
    {
        HttpContext.Response.Headers.CacheControl = "no-store";
        return Results.Content(EndpointCatalogPage.Html, "text/html; charset=utf-8");
    }

    private static string NormalizePath(string path) => path.StartsWith('/') ? path : "/" + path;

    private static string DescribeAuthorization(RouteEndpoint endpoint)
    {
        var requirements = new List<string>();
        var allowAnonymous = endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null;
        var authorization = allowAnonymous ? [] : endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>();
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