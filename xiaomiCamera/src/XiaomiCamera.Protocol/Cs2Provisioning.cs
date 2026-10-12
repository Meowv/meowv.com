using System.Net;

namespace XiaomiCamera.Protocol;

/// <summary>小米云针对一台 CS2 设备下发的短期连接参数。</summary>
public sealed record Cs2Provisioning(Cs2Uid DeviceId, IReadOnlyList<IPAddress> RendezvousServers, string ClientPublicKey, string DevicePublicKey, string Sign)
{
    public const int RendezvousPort = 32100;
}