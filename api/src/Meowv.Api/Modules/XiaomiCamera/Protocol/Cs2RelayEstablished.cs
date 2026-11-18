using System.Net;

namespace Meowv.Api.Modules.XiaomiCamera.Protocol;

/// <summary>CS2 中继协商成功后可用于后续 MISS 会话的 UDP 连接材料。</summary>
public sealed record Cs2RelayEstablished(IPEndPoint Relay);