namespace Meowv.Api.Modules.Chat.Api;

public sealed record ChatStatus(int OnlineUsers, DateTimeOffset ServerTime, bool MessageCleanupEnabled, int RetentionDays, int MaxMessageChars, int MaxMessageBytes);