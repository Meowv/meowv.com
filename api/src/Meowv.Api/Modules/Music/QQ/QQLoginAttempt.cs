namespace Meowv.Api.Modules.Music.QQ;

internal sealed record QQLoginAttempt(Guid Id, string Status, bool QrReady, DateTimeOffset ExpiresAt);