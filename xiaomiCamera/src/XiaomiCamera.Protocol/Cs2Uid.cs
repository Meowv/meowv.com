using System.Globalization;
using System.Text;

namespace XiaomiCamera.Protocol;

/// <summary>CS2 P2P 标识的 20 字节线缆表示。</summary>
public sealed record Cs2Uid(string Prefix, uint Serial, string Check)
{
    public const int WireLength = 20;

    public static Cs2Uid Parse(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        var parts = value.Trim().Split('-');
        if (parts.Length != 3 || !uint.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var serial))
        {
            throw new FormatException("CS2 P2P ID 必须为 PREFIX-SERIAL-CHECK 格式。");
        }

        ValidateAscii(parts[0], nameof(Prefix));
        ValidateAscii(parts[2], nameof(Check));
        return new Cs2Uid(parts[0], serial, parts[2]);
    }

    public byte[] Encode()
    {
        ValidateAscii(Prefix, nameof(Prefix));
        ValidateAscii(Check, nameof(Check));
        var result = new byte[WireLength];
        Encoding.ASCII.GetBytes(Prefix, result);
        result[8] = (byte)(Serial >> 24);
        result[9] = (byte)(Serial >> 16);
        result[10] = (byte)(Serial >> 8);
        result[11] = (byte)Serial;
        Encoding.ASCII.GetBytes(Check, result.AsSpan(12));
        return result;
    }

    private static void ValidateAscii(string value, string parameterName)
    {
        if (value.Length is 0 or > 8 || value.Any(character => character is > '\x7f' or '-'))
        {
            throw new ArgumentException("CS2 P2P ID 的每个文本段必须是 1 至 8 个 ASCII 字符。", parameterName);
        }
    }
}