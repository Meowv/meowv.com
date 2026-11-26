using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.Studio.Api.Controllers;

[ApiController]
[EndpointModule("studio")]
public sealed class StudioLayoutController(StudioLayoutService layouts) : StudioControllerBase
{
    [HttpGet("/api/studio/layout")]
    [Authorize(Policy = StudioPolicies.Verified)]
    [EnableRateLimiting("studio-read")]
    [EndpointSummary("读取当前用户桌面布局与 revision。")]
    public async Task<IResult> Get(CancellationToken cancellationToken)
    {
        var userId = StudioCurrentUser.Id(User);
        if (userId is null) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);

        var envelope = await layouts.GetEnvelopeAsync(userId.Value, cancellationToken);
        Response.Headers.ETag = Tag(envelope.Revision);
        return Results.Json(envelope, StudioJson.Options);
    }

    [HttpPut("/api/studio/layout")]
    [Authorize(Policy = StudioPolicies.Verified)]
    [EnableRateLimiting("studio-write")]
    [RequestSizeLimit(StudioDesktopLimits.MaxLayoutJsonBytes + 4096)]
    [EndpointSummary("整份保存桌面布局；使用 If-Match + revision 做乐观并发控制。")]
    public async Task<IResult> Put([FromBody] StudioLayoutWriteRequest request, CancellationToken cancellationToken)
    {
        var userId = StudioCurrentUser.Id(User);
        if (userId is null) return StudioResults.Error(StatusCodes.Status401Unauthorized, "登录状态无效。", StudioErrorCodes.Unauthorized, HttpContext);

        if (request.Layout is null)
            return StudioResults.Error(StatusCodes.Status400BadRequest, "布局不能为空。", StudioErrorCodes.Validation, HttpContext);

        if (string.IsNullOrEmpty(Request.Headers.IfMatch.ToString().Trim()))
            return StudioResults.Error(StatusCodes.Status400BadRequest, "缺少 If-Match 头。", StudioErrorCodes.RevisionRequired, HttpContext);

        var expected = ExpectedRevision(Request.Headers.IfMatch.ToString(), request.Revision);
        if (expected is null)
            return StudioResults.Error(StatusCodes.Status400BadRequest, "If-Match 头无效。", StudioErrorCodes.Validation, HttpContext);

        var result = await layouts.PutAsync(userId.Value, request.Layout, expected.Value, cancellationToken);
        if (!result.Ok)
            return StudioResults.From(result, HttpContext);

        var operation = result.Value!;
        if (operation.Status == StudioLayoutPutStatus.Conflict)
            return Results.Json(new StudioLayoutConflictResponse
            {
                Error = "布局已在其他设备上更新。",
                Code = StudioErrorCodes.RevisionConflict,
                RequestId = HttpContext.Items[StudioRequestIdMiddleware.ItemKey] as string,
                Current = operation.Envelope
            }, StudioJson.Options, statusCode: StatusCodes.Status409Conflict);

        Response.Headers.ETag = Tag(operation.Envelope.Revision);
        return Results.Json(operation.Envelope, StudioJson.Options);
    }

    private static string Tag(long revision)
    {
        return $"\"layout-{revision}\"";
    }

    private static long? ExpectedRevision(string header, long bodyRevision)
    {
        if (header.Trim() == "*") return bodyRevision;

        var value = header.Trim().Trim('"');
        if (value.StartsWith("layout-", StringComparison.Ordinal)) value = value["layout-".Length..];
        return long.TryParse(value, out var parsed) && parsed >= 0 ? parsed : null;
    }
}