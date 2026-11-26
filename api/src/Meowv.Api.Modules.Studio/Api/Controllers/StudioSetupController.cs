using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.Studio.Api.Controllers;

[ApiController]
[EndpointModule("studio", OptionsType = typeof(StudioOptions))]
public sealed class StudioSetupController(StudioAdminService admins, IStudioStore store) : StudioControllerBase
{
    [HttpGet("/api/studio/setup/admin")]
    [Authorize(Policy = ApiAuthorization.ManagementPolicy)]
    [EnableRateLimiting("studio-read")]
    [EndpointSummary("检查是否已有可登录 Studio 管理员。")]
    public async Task<IResult> Status(CancellationToken cancellationToken)
    {
        var adminExists = await store.CountUsableAdminsAsync(null, cancellationToken) > 0;
        return Results.Json(new StudioSetupAdminStatusResponse(adminExists), StudioJson.Options);
    }

    [HttpPost("/api/studio/setup/admin")]
    [Authorize(Policy = ApiAuthorization.ManagementPolicy)]
    [EnableRateLimiting("studio-setup")]
    [EndpointSummary("使用管理密钥创建首个管理员；已有可登录管理员时返回 409。")]
    public async Task<IResult> CreateAdmin([FromBody] StudioSetupAdminRequest request, CancellationToken cancellationToken)
    {
        var result = await admins.CreateFirstAdminAsync(request.Username, request.Email, request.Password, cancellationToken);
        return StudioResults.From(result, HttpContext, user => Results.Json(StudioUserProfileResponse.From(user), StudioJson.Options, statusCode: StatusCodes.Status201Created));
    }
}