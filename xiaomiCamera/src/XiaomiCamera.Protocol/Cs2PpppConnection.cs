using System.Buffers.Binary;
using System.Net;
using System.Security.Cryptography;
using System.Threading.Channels;

namespace XiaomiCamera.Protocol;

/// <summary>在已建立 CS2 relay 上维护 PPPP 控制通道，并负责链路、保活和 DRW 确认。</summary>
public sealed class Cs2PpppConnection(Cs2RelaySession relaySession, Cs2RelayEstablished relay) : IAsyncDisposable
{
    public const byte CommandChannel = 0;
    public const byte MediaChannel = 2;
    private readonly Cs2RelaySession relaySession = relaySession ?? throw new ArgumentNullException(nameof(relaySession));
    private readonly Cs2RelayEstablished relay = relay ?? throw new ArgumentNullException(nameof(relay));
    private readonly IPEndPoint localEndpoint = relaySession.GetLocalEndpointForRelay(relay.Relay);
    private readonly Cs2DataChannel commandChannel = new();
    private readonly Cs2DataChannel mediaChannel = new();

    private readonly Channel<byte[]> commands = Channel.CreateUnbounded<byte[]>();

    // 转码落后于网络时优先保留最新帧，限制内存并避免旧视频持续堆积导致延迟扩大。
    private readonly Channel<byte[]> media = Channel.CreateBounded<byte[]>(
        new BoundedChannelOptions(128)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = true,
        },
        static message => CryptographicOperations.ZeroMemory(message));

    private readonly TaskCompletionSource linked = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly CancellationTokenSource stopping = new();
    private Task? receiver;
    private ushort commandSequence;
    private bool disposed;

    public void Start()
    {
        ThrowIfDisposed();
        receiver ??= Task.Run(ReceiveLoopAsync);
    }

    public Task WaitForLinkAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        return linked.Task.WaitAsync(timeout, cancellationToken);
    }

    public async Task SendCommandAsync(int command, ReadOnlyMemory<byte> body, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        var message = new byte[8 + body.Length];
        BinaryPrimitives.WriteInt32BigEndian(message, 4 + body.Length);
        BinaryPrimitives.WriteInt32BigEndian(message.AsSpan(4), command);
        body.CopyTo(message.AsMemory(8));

        var payload = new byte[4 + message.Length];
        payload[0] = 0xD1;
        payload[1] = CommandChannel;
        BinaryPrimitives.WriteUInt16BigEndian(payload.AsSpan(2), commandSequence++);
        message.CopyTo(payload, 4);
        await relaySession.SendFrameAsync(relay.Relay, new Cs2Frame(Cs2MessageType.Drw, payload), cancellationToken);
    }

    public async Task<Cs2CommandMessage?> ReadCommandAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        using var wait = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, stopping.Token);
        wait.CancelAfter(timeout);
        try
        {
            var message = await commands.Reader.ReadAsync(wait.Token);
            return message.Length < sizeof(int) ? null : new Cs2CommandMessage(BinaryPrimitives.ReadInt32BigEndian(message), message[sizeof(int)..]);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return null;
        }
    }

    public async Task<byte[]?> ReadMediaAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        using var wait = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, stopping.Token);
        wait.CancelAfter(timeout);
        try
        {
            return await media.Reader.ReadAsync(wait.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return null;
        }
    }

    private async Task ReceiveLoopAsync()
    {
        try
        {
            while (!stopping.IsCancellationRequested)
            {
                var received = await relaySession.ReceiveFrameAsync(TimeSpan.FromSeconds(2), stopping.Token);
                if (received is null)
                {
                    continue;
                }

                await DispatchAsync(received.Value.Frame, stopping.Token);
            }
        }
        catch (OperationCanceledException) when (stopping.IsCancellationRequested)
        {
            // 正常关闭。
        }
        catch (Exception exception)
        {
            linked.TrySetException(exception);
            commands.Writer.TryComplete(exception);
            media.Writer.TryComplete(exception);
            return;
        }

        commands.Writer.TryComplete();
        media.Writer.TryComplete();
    }

    private async Task DispatchAsync(Cs2Frame frame, CancellationToken cancellationToken)
    {
        switch (frame.Type)
        {
            case Cs2MessageType.Drw:
                await HandleDataAsync(frame.Payload, cancellationToken);
                break;
            case Cs2MessageType.Alive:
                await relaySession.SendFrameAsync(relay.Relay, new Cs2Frame(Cs2MessageType.AliveAcknowledged, []), cancellationToken);
                break;
            case Cs2MessageType.MissSetup when Cs2MissSetup.IsRequest(frame.Payload):
                var reply = Cs2MissSetup.CreateReply(frame.Payload, localEndpoint);
                await relaySession.SendFrameAsync(relay.Relay, new Cs2Frame(Cs2MessageType.MissSetup, reply), cancellationToken);
                linked.TrySetResult();
                break;
            case Cs2MessageType.Close:
                throw new Cs2ProtocolException("摄像机关闭了 CS2 会话。");
        }
    }

    private async Task HandleDataAsync(byte[] payload, CancellationToken cancellationToken)
    {
        if (payload.Length < 4 || payload[0] != 0xD1)
        {
            return;
        }

        var channel = payload[1];
        var sequence = BinaryPrimitives.ReadUInt16BigEndian(payload.AsSpan(2));
        var acknowledgement = new byte[] { 0xD1, channel, 0, 1, payload[2], payload[3] };
        await relaySession.SendFrameAsync(relay.Relay,
            new Cs2Frame(Cs2MessageType.DrwAcknowledged, acknowledgement), cancellationToken);

        var target = channel switch
        {
            CommandChannel => commandChannel,
            MediaChannel => mediaChannel,
            _ => null,
        };
        if (target is null)
        {
            return;
        }

        target.Push(sequence, payload.AsSpan(4));
        switch (channel)
        {
            case CommandChannel:
            {
                while (target.TryRead(out var message) && message is not null)
                {
                    await commands.Writer.WriteAsync(message, cancellationToken);
                }

                break;
            }
            case MediaChannel:
            {
                while (target.TryRead(out var message) && message is not null)
                {
                    await media.Writer.WriteAsync(message, cancellationToken);
                }

                break;
            }
        }
    }

    private void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(disposed, this);

    public async ValueTask DisposeAsync()
    {
        if (disposed)
        {
            return;
        }

        disposed = true;
        try
        {
            await relaySession.SendFrameAsync(relay.Relay, new Cs2Frame(Cs2MessageType.Close, []), CancellationToken.None);
        }
        catch (Exception)
        {
            // 会话关闭期间的网络错误无需继续传播。
        }

        await stopping.CancelAsync();
        if (receiver is not null)
        {
            try
            {
                await receiver;
            }
            catch (OperationCanceledException)
            {
                // 正常关闭。
            }
        }

        while (media.Reader.TryRead(out var message))
        {
            CryptographicOperations.ZeroMemory(message);
        }

        stopping.Dispose();
    }
}

public sealed record Cs2CommandMessage(int Command, byte[] Body);