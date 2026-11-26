namespace Meowv.Api.Modules.Music.Domain;

internal sealed record QQLoginAttempt(Guid Id, string Status, bool QrReady, DateTimeOffset ExpiresAt);
