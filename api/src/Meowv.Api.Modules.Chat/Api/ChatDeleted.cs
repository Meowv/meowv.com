namespace Meowv.Api.Modules.Chat.Api;

public sealed record ChatDeleted(string Id, DateTimeOffset DeletedAt, bool Permanent, int Revision);