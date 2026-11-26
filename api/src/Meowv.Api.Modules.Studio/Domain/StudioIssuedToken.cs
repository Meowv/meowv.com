namespace Meowv.Api.Modules.Studio.Domain;

public sealed record StudioIssuedToken(string Token, string TokenId, DateTimeOffset ExpiresAt);