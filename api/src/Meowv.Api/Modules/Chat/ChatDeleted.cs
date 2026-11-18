namespace Meowv.Api.Modules.Chat;

public sealed record ChatDeleted(string Id, DateTimeOffset DeletedAt, bool Permanent, int Revision);