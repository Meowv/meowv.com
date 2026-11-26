using System.Net;

namespace Meowv.Api.Modules.XiaomiCamera.Infrastructure.Protocol;

public sealed record Cs2Provisioning(Cs2Uid DeviceId, IReadOnlyList<IPAddress> RendezvousServers, string ClientPublicKey, string DevicePublicKey, string Sign)
{
    public const int RendezvousPort = 32100;
}