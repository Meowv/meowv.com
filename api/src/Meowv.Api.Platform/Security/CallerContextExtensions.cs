using System.Security.Claims;

namespace Meowv.Api.Platform.Security;

public static class CallerContextExtensions
{
    public static CallerContext ToCallerContext(this HttpContext context)
    {
        var id = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        return new CallerContext(id, ApiAuthorization.GetVersion(context.User), context.Connection.RemoteIpAddress?.ToString() ?? "unknown", context.User.FindFirst("chat_hash")?.Value, id);
    }
}