namespace Meowv.Api.Modules.Chat;

public sealed record ChatStatus(int OnlineUsers, DateTimeOffset ServerTime, bool MessageCleanupEnabled, int RetentionDays, int MaxMessageChars, int MaxMessageBytes);