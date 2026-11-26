using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;

namespace Meowv.Api.Modules.XiaomiCamera.Api;

[ApiController]
[EndpointModule("xiaomi-camera")]
public sealed class XiaomiCameraHealthController : ControllerBase
{
    [HttpGet("/api/xiaomi-camera/health")]
    [AllowAnonymous]
    [ModuleHealth]
    [EnableCors(ApiAuthorization.CorsPolicy)]
    [EndpointSummary("摄像头模块就绪状态。")]
    public IResult Health([FromServices] XiaomiModuleRuntime runtime) => Results.Json(new XiaomiModuleHealthResponse(runtime.Status, runtime.FailureReason), XiaomiHttpJsonContext.Default.XiaomiModuleHealthResponse, statusCode: runtime.IsReady ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
}