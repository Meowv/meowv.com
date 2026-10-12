using System.Net;

namespace XiaomiCamera.Protocol;

/// <summary>CS2 的 16 字节 IPv4 sockaddr 表示，端口和地址字节序与普通网络字节序不同。</summary>
public sealed record Cs2AddressBlock(IPAddress Address, ushort Port)
{
    public const int WireLength = 16;

    public byte[] Encode()
    {
        var address = Address.GetAddressBytes();
        if (address.Length != 4)
        {
            throw new InvalidOperationException("CS2 地址块只支持 IPv4。");
        }

        var result = new byte[WireLength];
        result[0] = 0;
        result[1] = 2;
        result[2] = (byte)Port;
        result[3] = (byte)(Port >> 8);
        for (var index = 0; index < 4; index++)
        {
            result[4 + index] = address[3 - index];
        }

        return result;
    }

    public static Cs2AddressBlock Decode(ReadOnlySpan<byte> data)
    {
        if (data.Length < WireLength || data[0] != 0 || data[1] != 2)
        {
            throw new FormatException("无效的 CS2 IPv4 地址块。");
        }

        var port = (ushort)(data[2] | (data[3] << 8));
        return new Cs2AddressBlock(new IPAddress([data[7], data[6], data[5], data[4]]), port);
    }
}