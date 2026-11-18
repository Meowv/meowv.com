using System.Globalization;
using System.Text;

namespace Meowv.Api.Modules.Chat;

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