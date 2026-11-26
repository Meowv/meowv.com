namespace Meowv.Api.Modules.Studio.Domain;

public sealed record StudioValidatedToken(Guid UserId, string TokenId, DateTimeOffset ExpiresAt);