using System.Security.Cryptography;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioRequestIdMiddleware(RequestDelegate next, ILogger<StudioRequestIdMiddleware> logger)
{
    public const string HeaderName = "X-Request-Id";
    public const string ItemKey = "studio.request_id";
    private const int MaxLength = 64;

    public async Task InvokeAsync(HttpContext context)
    {
        var requestId = ResolveOrCreate(context.Request);

        context.Items[ItemKey] = requestId;
        context.TraceIdentifier = requestId;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[HeaderName] = requestId;
            return Task.CompletedTask;
        });

        using (logger.BeginScope(new Dictionary<string, object> { ["RequestId"] = requestId }))
        {
            await next(context);
        }
    }

    public static string ResolveOrCreate(HttpRequest request)
    {
        var incoming = request.Headers[HeaderName].ToString();
        return IsAcceptable(incoming)
            ? incoming
            : Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
    }

    private static bool IsAcceptable(string value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > MaxLength) return false;

        return value.Select(ch => ch is >= 'a' and <= 'z' or >= 'A' and <= 'Z' or >= '0' and <= '9' or '-' or '_' or '.').All(ok => ok);
    }
}