using Meowv.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Meowv.Api.Modules.Health;

[ApiController]
[EndpointModule("health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet("/api/health")]
    [AllowAnonymous]
    [ModuleHealth]
    [EndpointSummary("服务存活探针，固定返回 healthy。")]
    public IResult Get()
        => Results.Json(new HealthResponse("healthy"), HealthJsonContext.Default.HealthResponse);
}
