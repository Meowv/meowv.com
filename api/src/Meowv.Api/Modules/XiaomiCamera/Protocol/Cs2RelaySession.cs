using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;

namespace Meowv.Api.Modules.XiaomiCamera.Protocol;

/// <summary>CS2 中继协商成功后可用于后续 MISS 会话的 UDP 连接材料。</summary>
public sealed record Cs2RelayEstablished(IPEndPoint Relay);

/// <summary>
/// 使用同一个 UDP 本地端口完成 CS2 中继发现、注册和设备加入。
/// 成功后调用方必须保留此实例，供后续的 MISS 会话继续使用该 NAT 映射。
/// </summary>
public sealed class Cs2RelaySession(Cs2Provisioning provisioning) : IDisposable
{
    private const int RelayControlPort = 25000;
    private const int RegistrationRepeats = 4;
    private const int SessionRepeats = 24;
    private readonly Cs2Provisioning _provisioning = provisioning ?? throw new ArgumentNullException(nameof(provisioning));
    private readonly UdpClient _socket = new(AddressFamily.InterNetwork);
    private bool _disposed;

    public IPEndPoint GetLocalEndpointForRelay(IPEndPoint relay)
    {
        ThrowIfDisposed();
        ArgumentNullException.ThrowIfNull(relay);
        if (_socket.Client.LocalEndPoint is not IPEndPoint local)
        {
            throw new InvalidOperationException("CS2 UDP socket 尚未绑定本地端口。");
        }

        using var probe = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        probe.Connect(relay);
        var address = ((IPEndPoint)probe.LocalEndPoint!).Address;
        return new IPEndPoint(address, local.Port);
    }

    public async Task<Cs2RelayEstablished> ConnectAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        if (timeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(timeout));
        }

        var deadline = DateTimeOffset.UtcNow + timeout;
        var lastFailure = "在中继发现阶段超时。";
        while (DateTimeOffset.UtcNow < deadline)
        {
            var candidates = await DiscoverRelaysAsync(deadline, cancellationToken);
            if (candidates.Count == 0)
            {
                lastFailure = "未收到 CS2 中继候选；设备可能离线或当前网络阻断了 UDP。";
                continue;
            }

            IPEndPoint? controlEndpoint;
            try
            {
                controlEndpoint = await GreetRelayAsync(candidates, deadline, cancellationToken);
            }
            finally
            {
                // rendezvous token 只用于本轮中继问候，后续协议不再需要它。
                ClearCandidateTokens(candidates);
            }

            if (controlEndpoint is null)
            {
                lastFailure = "中继未确认客户端注册。";
                continue;
            }

            var allocation = await AllocateSessionPortAsync(controlEndpoint, deadline, cancellationToken);
            if (allocation is null)
            {
                lastFailure = "中继未分配会话端口。";
                continue;
            }

            var allocationToken = allocation.Value.Token;
            try
            {
                if (!await AwaitDeviceJoinAsync(allocation.Value.Relay, allocationToken, deadline, cancellationToken))
                {
                    lastFailure = "摄像机未加入中继会话。";
                    continue;
                }
            }
            finally
            {
                CryptographicOperations.ZeroMemory(allocationToken);
            }

            return new Cs2RelayEstablished(allocation.Value.Relay);
        }

        throw new Cs2RelayException(lastFailure);
    }

    public Task SendFrameAsync(IPEndPoint endpoint, Cs2Frame frame, CancellationToken cancellationToken) => SendRawAsync(endpoint, frame.Encode(), cancellationToken);

    public Task SendRawAsync(IPEndPoint endpoint, byte[] datagram, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        ArgumentNullException.ThrowIfNull(endpoint);
        ArgumentNullException.ThrowIfNull(datagram);
        return _socket.SendAsync(datagram, endpoint, cancellationToken).AsTask();
    }

    public async Task<(Cs2Frame Frame, IPEndPoint Sender)?> ReceiveFrameAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        if (timeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(timeout));
        }

        var deadline = DateTimeOffset.UtcNow + timeout;
        return await ReceiveUntilAsync(deadline, cancellationToken);
    }

    private async Task<Dictionary<string, RelayCandidate>> DiscoverRelaysAsync(DateTimeOffset deadline, CancellationToken cancellationToken)
    {
        var uid = _provisioning.DeviceId.Encode();
        foreach (var server in _provisioning.RendezvousServers)
        {
            await SendFrameAsync(new IPEndPoint(server, Cs2Provisioning.RendezvousPort),
                new Cs2Frame(Cs2MessageType.ListRequest, uid), cancellationToken);
        }

        var candidates = new Dictionary<string, RelayCandidate>(StringComparer.Ordinal);
        var discoveryDeadline = Min(deadline, DateTimeOffset.UtcNow + TimeSpan.FromMilliseconds(2500));
        while (await ReceiveUntilAsync(discoveryDeadline, cancellationToken) is { } received)
        {
            if (received.Frame.Type != Cs2MessageType.RelayTo || received.Frame.Payload.Length < Cs2AddressBlock.WireLength + 4)
            {
                continue;
            }

            Cs2AddressBlock address;
            try
            {
                address = Cs2AddressBlock.Decode(received.Frame.Payload);
            }
            catch (FormatException)
            {
                continue;
            }

            var endpoint = new IPEndPoint(address.Address, address.Port);
            var token = received.Frame.Payload.AsSpan(Cs2AddressBlock.WireLength, 4).ToArray();
            var key = endpoint.ToString();
            if (!candidates.TryGetValue(key, out var candidate))
            {
                candidate = new RelayCandidate(endpoint);
                candidates.Add(key, candidate);
            }

            candidate.AddToken(token);
        }

        return candidates;
    }

    private async Task<IPEndPoint?> GreetRelayAsync(IReadOnlyDictionary<string, RelayCandidate> candidates, DateTimeOffset deadline, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 4 && DateTimeOffset.UtcNow < deadline; attempt++)
        {
            foreach (var candidate in candidates.Values)
            {
                foreach (var token in candidate.Tokens)
                {
                    var registration = BuildRegistration(token);
                    try
                    {
                        for (var repeat = 0; repeat < RegistrationRepeats; repeat++)
                        {
                            await SendFrameAsync(candidate.Endpoint, new Cs2Frame(Cs2MessageType.RelayPacket, registration), cancellationToken);
                        }
                    }
                    finally
                    {
                        CryptographicOperations.ZeroMemory(registration);
                    }
                }

                await SendFrameAsync(candidate.Endpoint, new Cs2Frame(Cs2MessageType.RelayHello, []), cancellationToken);
            }

            var sliceDeadline = Min(deadline, DateTimeOffset.UtcNow + TimeSpan.FromMilliseconds(2500));
            while (await ReceiveUntilAsync(sliceDeadline, cancellationToken) is { } received)
            {
                if (received.Frame.Type == Cs2MessageType.RelayHelloAcknowledged)
                {
                    return new IPEndPoint(received.Sender.Address, RelayControlPort);
                }
            }
        }

        return null;
    }

    private async Task<(IPEndPoint Relay, byte[] Token)?> AllocateSessionPortAsync(
        IPEndPoint controlEndpoint,
        DateTimeOffset deadline,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 4 && DateTimeOffset.UtcNow < deadline; attempt++)
        {
            await SendFrameAsync(controlEndpoint, new Cs2Frame(Cs2MessageType.RelayPort, []), cancellationToken);
            var sliceDeadline = Min(deadline, DateTimeOffset.UtcNow + TimeSpan.FromSeconds(2));
            while (await ReceiveUntilAsync(sliceDeadline, cancellationToken) is { } received)
            {
                if (received.Frame.Type != Cs2MessageType.RelayPortAcknowledged || received.Frame.Payload.Length < 6)
                {
                    continue;
                }

                var payload = received.Frame.Payload;
                var port = (ushort)((payload[4] << 8) | payload[5]);
                return (new IPEndPoint(controlEndpoint.Address, port), payload[..4]);
            }
        }

        return null;
    }

    private async Task<bool> AwaitDeviceJoinAsync(
        IPEndPoint relay,
        byte[] sessionToken,
        DateTimeOffset deadline,
        CancellationToken cancellationToken)
    {
        var request = new byte[Cs2Uid.WireLength + Cs2AddressBlock.WireLength + sessionToken.Length];
        var keepAlivePayload = BuildRegistration(sessionToken);
        try
        {
            _provisioning.DeviceId.Encode().CopyTo(request, 0);
            new Cs2AddressBlock(relay.Address, (ushort)relay.Port).Encode().CopyTo(request, Cs2Uid.WireLength);
            sessionToken.CopyTo(request, Cs2Uid.WireLength + Cs2AddressBlock.WireLength);
            var keepAlive = new Cs2Frame(Cs2MessageType.RelayPacket, keepAlivePayload);

            for (var attempt = 0; attempt < 6 && DateTimeOffset.UtcNow < deadline; attempt++)
            {
                foreach (var server in _provisioning.RendezvousServers)
                {
                    await SendFrameAsync(new IPEndPoint(server, Cs2Provisioning.RendezvousPort),
                        new Cs2Frame(Cs2MessageType.RelayRequest, request), cancellationToken);
                }

                for (var repeat = 0; repeat < SessionRepeats; repeat++)
                {
                    await SendFrameAsync(relay, keepAlive, cancellationToken);
                }

                var sliceDeadline = Min(deadline, DateTimeOffset.UtcNow + TimeSpan.FromSeconds(2));
                while (await ReceiveUntilAsync(sliceDeadline, cancellationToken) is { } received)
                {
                    if (received.Frame.Type == Cs2MessageType.RelayReady)
                    {
                        return true;
                    }
                }
            }

            return false;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(request);
            CryptographicOperations.ZeroMemory(keepAlivePayload);
        }
    }

    private byte[] BuildRegistration(byte[] token)
    {
        if (token.Length != 4)
        {
            throw new ArgumentException("CS2 relay token 必须恰好为 4 字节。", nameof(token));
        }

        var registration = new byte[4 + Cs2Uid.WireLength + 4];
        token.CopyTo(registration, 0);
        _provisioning.DeviceId.Encode().CopyTo(registration, 4);
        return registration;
    }

    private async Task<(Cs2Frame Frame, IPEndPoint Sender)?> ReceiveUntilAsync(
        DateTimeOffset deadline,
        CancellationToken cancellationToken)
    {
        while (DateTimeOffset.UtcNow < deadline)
        {
            var remaining = deadline - DateTimeOffset.UtcNow;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(remaining);
            try
            {
                var received = await _socket.ReceiveAsync(timeout.Token);
                if (Cs2Frame.TryParse(received.Buffer, out var frame) && frame is not null)
                {
                    return (frame, received.RemoteEndPoint);
                }
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return null;
            }
        }

        return null;
    }

    private static DateTimeOffset Min(DateTimeOffset left, DateTimeOffset right) => left < right ? left : right;

    private static void ClearCandidateTokens(IReadOnlyDictionary<string, RelayCandidate> candidates)
    {
        foreach (var candidate in candidates.Values)
        {
            foreach (var token in candidate.Tokens)
            {
                CryptographicOperations.ZeroMemory(token);
            }
        }
    }

    private void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(_disposed, this);

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _socket.Dispose();
    }

    private sealed class RelayCandidate(IPEndPoint endpoint)
    {
        public IPEndPoint Endpoint { get; } = endpoint;
        public List<byte[]> Tokens { get; } = [];

        public void AddToken(byte[] token)
        {
            if (!Tokens.Any(existing => existing.AsSpan().SequenceEqual(token)))
            {
                Tokens.Add(token);
            }
        }
    }
}

public sealed class Cs2RelayException(string message) : Exception(message);