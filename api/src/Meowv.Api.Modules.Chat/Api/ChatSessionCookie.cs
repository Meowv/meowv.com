namespace Meowv.Api.Modules.Chat.Api;

internal static class ChatSessionCookie
{
    public const string CookieName = "meowv_chat_session";

    public static string? Token(HttpContext context) => context.Request.Cookies[CookieName];

    public static void Write(HttpContext context, string token, DateTimeOffset expires) => context.Response.Cookies.Append(CookieName, token, Options(context, expires));

    public static void Delete(HttpContext context) => context.Response.Cookies.Delete(CookieName, Options(context, null));

    private static CookieOptions Options(HttpContext context, DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = !context.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment() || context.Request.IsHttps,
        SameSite = SameSiteMode.Strict,
        Path = "/api/chat",
        Expires = expires,
        MaxAge = expires.HasValue ? expires.Value - DateTimeOffset.UtcNow : null,
        IsEssential = true,
    };
}