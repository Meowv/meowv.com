using System.Net;

namespace Meowv.Api.Modules.XiaomiCamera.Protocol;

/// <summary>中继在 RLY_RDY 后发起的 Xiaomi 0x28 链路建立交换。</summary>
public static class Cs2MissSetup
{
    public const int PayloadLength = 88;

    public static bool IsRequest(ReadOnlySpan<byte> payload) => payload.Length >= PayloadLength && payload[0] == 0xA1 && payload[1] == 0x01;

    public static byte[] CreateReply(ReadOnlySpan<byte> request, IPEndPoint localEndpoint)
    {
        ArgumentNullException.ThrowIfNull(localEndpoint);
        if (!IsRequest(request))
        {
            throw new FormatException("不是有效的 CS2 MISS setup 请求。");
        }

        var reply = request.ToArray();
        reply[1] = 0x02;
        reply[56] = 0xFE;
        reply[57] = 0xFF;
        reply[58] = 0xFF;
        reply[59] = 0xFF;
        for (var index = 0; index < 4; index++)
        {
            reply[60 + index] = request[7 - index];
        }

        new Cs2AddressBlock(localEndpoint.Address, (ushort)localEndpoint.Port).Encode().CopyTo(reply, 64);
        var external = Cs2AddressBlock.Decode(request.Slice(40, Cs2AddressBlock.WireLength));
        WriteCompactAddress(external, reply.AsSpan(80, 8));
        return reply;
    }

    private static void WriteCompactAddress(Cs2AddressBlock address, Span<byte> output)
    {
        var octets = address.Address.GetAddressBytes();
        if (octets.Length != 4 || output.Length != 8)
        {
            throw new ArgumentException("CS2 compact 地址格式无效。");
        }

        output[0] = 0x02;
        output[1] = 0x00;
        output[2] = (byte)(address.Port >> 8);
        output[3] = (byte)address.Port;
        octets.CopyTo(output[4..]);
    }
}