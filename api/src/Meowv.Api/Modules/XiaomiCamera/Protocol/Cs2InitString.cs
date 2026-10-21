using System.Text;
using System.Net;

namespace Meowv.Api.Modules.XiaomiCamera.Protocol;

/// <summary>解开云端 provisioning 返回的 CS2 rendezvous 服务器列表。</summary>
public static class Cs2InitString
{
    private static readonly byte[] Lookup = Convert.FromHexString("4959433db5bf6da347534f6165e371e9677f02030badb3892b2f35c16b8b95" + "9711e5a70deff1050783fb9d3bc5c713171d1f2529d3df");

    public static IReadOnlyList<IPAddress> DecodeServers(string initString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(initString);
        var encoded = initString.Split(':', 2)[0];
        if (encoded.Length == 0 || encoded.Length % 2 != 0 || encoded.Any(character => character is < 'A' or > 'P'))
        {
            throw new FormatException("无效的 CS2 init string。");
        }

        var decoded = new byte[encoded.Length / 2];
        var running = 0x39;
        for (var index = 0; index < decoded.Length; index++)
        {
            var high = (encoded[index * 2] - 'A') << 4;
            var low = encoded[(index * 2) + 1] - 'A';
            decoded[index] = (byte)(running ^ Lookup[index % Lookup.Length] ^ high ^ low);
            running ^= decoded[index];
        }

        var servers = new List<IPAddress>();
        foreach (var value in Encoding.ASCII.GetString(decoded).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (IPAddress.TryParse(value, out var address) && address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
            {
                servers.Add(address);
            }
            else
            {
                throw new FormatException("CS2 init string 包含无效的 IPv4 rendezvous 地址。");
            }
        }

        return servers;
    }
}