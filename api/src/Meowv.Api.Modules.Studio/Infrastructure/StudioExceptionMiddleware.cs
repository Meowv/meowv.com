namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed partial class StudioExceptionMiddleware(RequestDelegate next, ILogger<StudioExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/api/studio"))
        {
            await next(context);
            return;
        }

        try
        {
            await next(context);
        }
        catch (Exception ex) when (!context.Response.HasStarted)
        {
            var requestId = context.Items[StudioRequestIdMiddleware.ItemKey] as string;
            var (status, error, code) = ex switch
            {
                StudioApiException api => (api.StatusCode, api.Message, api.Code),
                BadHttpRequestException bad => (bad.StatusCode, "请求体无效。", "invalid_request"),
                OperationCanceledException when context.RequestAborted.IsCancellationRequested =>
                    (499, "请求已取消。", "cancelled"),
                _ => (StatusCodes.Status500InternalServerError, "服务暂时不可用。", "internal_error")
            };

            if (status >= 500)
                LogUnhandled(ex, context.Request.Method, context.Request.Path.Value ?? string.Empty);
            else
                LogHandled(status, context.Request.Method, context.Request.Path.Value ?? string.Empty, error);

            context.Response.Clear();
            context.Response.StatusCode = status;
            context.Response.Headers.CacheControl = "no-store";
            var details = ex is StudioApiException { Details: { } d } ? d : null;
            await context.Response.WriteAsJsonAsync(
                new StudioApiError(error, code, requestId, details),
                StudioJson.Options,
                context.RequestAborted);
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Unhandled Studio exception for {Method} {Path}")]
    private partial void LogUnhandled(Exception exception, string method, string path);

    [LoggerMessage(Level = LogLevel.Information, Message = "Handled Studio {Status} for {Method} {Path}: {Message}")]
    private partial void LogHandled(int status, string method, string path, string message);
}