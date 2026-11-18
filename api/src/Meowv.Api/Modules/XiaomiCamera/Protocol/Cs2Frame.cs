namespace Meowv.Api.Modules.XiaomiCamera.Protocol;

/// <summary>CS2/PPPP UDP 报文：F1、消息类型、16 位大端载荷长度和载荷。</summary>
public sealed record Cs2Frame(byte Type, byte[] Payload)
{
    public const byte Magic = 0xF1;
    public const int HeaderLength = 4;

    public byte[] Encode()
    {
        if (Payload.Length > ushort.MaxValue)
        {
            throw new InvalidOperationException("CS2 载荷不能超过 65535 字节。");
        }

        var result = new byte[HeaderLength + Payload.Length];
        result[0] = Magic;
        result[1] = Type;
        result[2] = (byte)(Payload.Length >> 8);
        result[3] = (byte)Payload.Length;
        Payload.CopyTo(result, HeaderLength);
        return result;
    }

    public static bool TryParse(ReadOnlySpan<byte> data, out Cs2Frame? frame)
    {
        frame = null;
        if (data.Length < HeaderLength || data[0] != Magic)
        {
            return false;
        }

        var declaredLength = (data[2] << 8) | data[3];
        if (data.Length != HeaderLength + declaredLength)
        {
            return false;
        }

        frame = new Cs2Frame(data[1], data[HeaderLength..].ToArray());
        return true;
    }
}