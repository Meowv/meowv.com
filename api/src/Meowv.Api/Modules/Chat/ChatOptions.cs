namespace Meowv.Api.Modules.Chat;

public sealed class ChatOptions
{
    public bool Enabled { get; set; }
    public bool MessageCleanupEnabled { get; set; }
    public int RetentionDays { get; set; } = 7;
    public int SessionDays { get; set; } = 7;
    public int AuditRetentionDays { get; set; } = 30;
    public int HistoryPageSize { get; set; } = 30;
    public int MaxHistoryPageSize { get; set; } = 100;
    public int MaxMessageChars { get; set; } = 500;
    public int MaxMessageBytes { get; set; } = 2048;
    public int SendCooldownMs { get; set; } = 2000;
    public int MessagesPerMinute { get; set; } = 20;
    public int IpMessagesPerMinute { get; set; } = 100;
    public int SessionsPerWindow { get; set; } = 5;
    public int SessionWindowMinutes { get; set; } = 10;
    public int MaxConnectionsPerGuest { get; set; } = 5;
    public int MaxConnections { get; set; } = 100;
    public int CleanupMinutes { get; set; } = 60;
    public int CleanupBatchSize { get; set; } = 500;
    public string[] BlockedNicknameTerms { get; set; } = [];

    public void Validate()
    {
        if ((MessageCleanupEnabled && (RetentionDays is < 1 or > 365)) || SessionDays is < 1 or > 365 ||
            AuditRetentionDays is < 1 or > 365 ||
            HistoryPageSize < 1 || MaxHistoryPageSize is < 1 or > 100 || HistoryPageSize > MaxHistoryPageSize ||
            MaxMessageChars is < 1 or > 500 || MaxMessageBytes is < 1 or > 2048 ||
            SendCooldownMs is < 1 or > 60000 || MessagesPerMinute is < 1 or > 1000 ||
            IpMessagesPerMinute is < 1 or > 10000 || SessionsPerWindow is < 1 or > 1000 ||
            SessionWindowMinutes is < 1 or > 1440 || MaxConnectionsPerGuest is < 1 or > 20 ||
            MaxConnections is < 1 or > 10000 || CleanupMinutes is < 1 or > 1440 ||
            CleanupBatchSize is < 1 or > 5000)
            throw new InvalidOperationException("Chat 配置无效。");
    }
}