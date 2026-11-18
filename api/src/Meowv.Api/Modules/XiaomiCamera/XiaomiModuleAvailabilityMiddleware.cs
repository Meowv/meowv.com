namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>在端点绑定业务依赖之前拦截，避免不可用模块重复构造失败的依赖。</summary>
internal sealed class XiaomiModuleAvailabilityMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, XiaomiModuleRuntime runtime)
    {
        if (context.GetEndpoint()?.Metadata.GetMetadata<XiaomiEndpointMetadata>() is not null && !runtime.IsReady)
        {
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(
                new XiaomiSetupError("xiaomi_module_unavailable", runtime.FailureReason ?? "小米摄像头模块尚未就绪，请检查服务端配置与 FFmpeg。"),
                XiaomiHttpJsonContext.Default.XiaomiSetupError, cancellationToken: context.RequestAborted);
            return;
        }

        await next(context);
    }
}