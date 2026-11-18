using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music;

internal static class MusicErrors
{
    internal static Task Write(HttpContext context, int status, string code, string message, int? retryAfter = null)
    {
        context.Response.StatusCode = status;
        context.Response.Headers.CacheControl = "no-store";
        if (retryAfter is not null) context.Response.Headers.RetryAfter = retryAfter.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return context.Response.WriteAsJsonAsync(new MusicErrorResponse(new MusicError(code, message,
                code is "rate_limited" or "source_timeout" or "source_unavailable", retryAfter, context.TraceIdentifier)),
            MusicJsonContext.Default.MusicErrorResponse, cancellationToken: context.RequestAborted);
    }
}