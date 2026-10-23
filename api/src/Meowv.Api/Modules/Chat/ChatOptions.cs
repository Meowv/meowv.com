using System.Globalization;
using System.Text;

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

public sealed class ChatException(string code, string message, int status = 400) : Exception(message)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}

public static class ChatValidation
{
    public static string Nickname(string? value, ChatOptions options)
    {
        if (value is null || value.Any(char.IsControl)) throw new ChatException("invalid_nickname", "昵称不能包含换行或控制字符。");
        string normalized;
        try
        {
            normalized = value.Normalize(NormalizationForm.FormC).Trim();
        }
        catch (ArgumentException)
        {
            throw new ChatException("invalid_nickname", "昵称包含无效字符。");
        }

        var length = StringInfo.ParseCombiningCharacters(normalized).Length;
        if (length is < 2 or > 20 || Encoding.UTF8.GetByteCount(normalized) > 64 ||
            string.IsNullOrWhiteSpace(normalized) || options.BlockedNicknameTerms.Any(term =>
                !string.IsNullOrEmpty(term) && normalized.Contains(term, StringComparison.OrdinalIgnoreCase)))
            throw new ChatException("invalid_nickname", "昵称须为 2–20 个字符，最多 64 字节，且不含受限内容。");
        return normalized;
    }

    public static string Content(string? value, ChatOptions options)
    {
        if (value is null) throw new ChatException("invalid_message", "请输入消息。");
        string content;
        try
        {
            content = value.Replace("\r\n", "\n").Normalize(NormalizationForm.FormC).Trim();
        }
        catch (ArgumentException)
        {
            throw new ChatException("invalid_message", "消息包含无效字符。");
        }

        if (string.IsNullOrWhiteSpace(content) || StringInfo.ParseCombiningCharacters(content).Length > options.MaxMessageChars ||
            Encoding.UTF8.GetByteCount(content) > options.MaxMessageBytes || content.Any(c => char.IsControl(c) && c is not '\n' and not '\t'))
            throw new ChatException("invalid_message", $"消息须为 1–{options.MaxMessageChars} 个字符，最多 {options.MaxMessageBytes} 字节。");
        return content;
    }
}