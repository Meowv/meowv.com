using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace Meowv.Api.Modules.Chat;

// 仅用于引用的纯文本摘要，不产生 HTML；格式范围与 Chat 前端保持一致。
internal static partial class ChatMarkdown
{
    [GeneratedRegex(@"^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)")]
    private static partial Regex BlockPrefix();

    [GeneratedRegex(@"^\s{0,3}(`{3,}|~{3,})")]
    private static partial Regex Fence();

    [GeneratedRegex(@"\n{3,}")]
    private static partial Regex BlankLines();

    internal static string Summary(string content)
    {
        var lines = content.Replace("\r\n", "\n").Split('\n');
        var result = new StringBuilder();
        var prose = new StringBuilder();

        string? fence = null;
        foreach (var raw in lines)
        {
            var match = Fence().Match(raw);
            if (match.Success && (fence is null || (match.Groups[1].Value[0] == fence[0] && match.Groups[1].Length >= fence.Length)))
            {
                FlushProse();
                fence = fence is null ? match.Groups[1].Value : null;
                continue;
            }

            var line = raw;
            if (fence is not null) result.AppendLine(line);
            else if (string.IsNullOrWhiteSpace(line))
            {
                FlushProse();
                result.AppendLine();
            }
            else if (line.StartsWith("    ", StringComparison.Ordinal))
            {
                FlushProse();
                result.AppendLine(line[4..]);
            }
            else
            {
                while (BlockPrefix().IsMatch(line)) line = BlockPrefix().Replace(line, "", 1);
                prose.AppendLine(line);
            }
        }

        FlushProse();
        var text = BlankLines().Replace(result.ToString().Replace("\r\n", "\n"), "\n\n").Trim();
        var indexes = StringInfo.ParseCombiningCharacters(text);
        return indexes.Length > 120 ? text[..indexes[120]] + "…" : text;

        void FlushProse()
        {
            if (prose.Length == 0) return;
            result.Append(Inline(prose.ToString()));
            prose.Clear();
        }
    }

    private static string Inline(string source)
    {
        var result = new StringBuilder();
        for (var i = 0; i < source.Length;)
        {
            var ch = source[i];
            switch (ch)
            {
                case '\\' when i + 1 < source.Length && (source[i + 1] < 128 && char.IsPunctuation(source[i + 1])):
                    result.Append(source[i + 1]);
                    i += 2;
                    continue;
                case '`':
                {
                    var run = 1;
                    while (i + run < source.Length && source[i + run] == '`') run++;
                    var delimiter = new string('`', run);
                    var close = source.IndexOf(delimiter, i + run, StringComparison.Ordinal);
                    if (close >= 0)
                    {
                        var code = source[(i + run)..close].Replace('\n', ' ');
                        if (code.Length > 1 && code[0] == ' ' && code[^1] == ' ' && !string.IsNullOrWhiteSpace(code)) code = code[1..^1];
                        result.Append(code);
                        i = close + run;
                        continue;
                    }

                    break;
                }
                case '[':
                {
                    var close = Matching(source, i, '[', ']');
                    if (close > i && close + 1 < source.Length && source[close + 1] == '(')
                    {
                        var end = Matching(source, close + 1, '(', ')');
                        if (end > close && Uri.TryCreate(source[(close + 2)..end].Split(' ')[0].Trim('<', '>'), UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https")
                        {
                            result.Append(Inline(source[(i + 1)..close]));
                            i = end + 1;
                            continue;
                        }
                    }

                    break;
                }
                case '*' or '_':
                {
                    var run = i + 1 < source.Length && source[i + 1] == ch ? 2 : 1;
                    var delimiter = new string(ch, run);
                    var close = source.IndexOf(delimiter, i + run, StringComparison.Ordinal);
                    var intraword = ch == '_' && i > 0 && char.IsLetterOrDigit(source[i - 1]);
                    if (!intraword && close > i + run && !char.IsWhiteSpace(source[i + run]) && !char.IsWhiteSpace(source[close - 1]))
                    {
                        result.Append(Inline(source[(i + run)..close]));
                        i = close + run;
                        continue;
                    }

                    break;
                }
                case '<':
                {
                    var close = source.IndexOf('>', i + 1);
                    if (close > i && Uri.TryCreate(source[(i + 1)..close], UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https")
                    {
                        result.Append(source[(i + 1)..close]);
                        i = close + 1;
                        continue;
                    }

                    break;
                }
                case '&':
                {
                    var close = source.IndexOf(';', i + 1);
                    if (close > i && close - i < 34)
                    {
                        var entity = source[i..(close + 1)];
                        var decoded = WebUtility.HtmlDecode(entity);
                        if (entity != decoded)
                        {
                            result.Append(decoded);
                            i = close + 1;
                            continue;
                        }
                    }

                    break;
                }
            }

            result.Append(ch);
            i++;
        }

        return result.ToString();
    }

    private static int Matching(string source, int start, char open, char close)
    {
        var depth = 0;
        for (var i = start; i < source.Length; i++)
        {
            if (source[i] == '\\')
            {
                i++;
                continue;
            }

            if (source[i] == open) depth++;
            if (source[i] == close && --depth == 0) return i;
        }

        return -1;
    }
}