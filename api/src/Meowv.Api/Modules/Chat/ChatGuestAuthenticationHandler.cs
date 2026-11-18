using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Meowv.Api.Modules.Chat;

public sealed class ChatGuestAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, ChatSessionService sessions)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "ChatGuest";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var session = sessions.Current(Context);
        if (session is not { Active: true }) return Task.FromResult(AuthenticateResult.NoResult());
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, session.Guest.Id), new Claim("chat_hash", session.TokenHash)], SchemeName);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), new AuthenticationProperties { ExpiresUtc = session.ExpiresAt }, SchemeName)));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = 401;
        return Response.WriteAsJsonAsync(new ChatError("session_expired", "请重新加入聊天室。"), ChatJsonContext.Default.ChatError);
    }
}