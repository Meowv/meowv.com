using System.Buffers.Binary;
using System.Net;
using System.Security.Cryptography;
using System.Threading.Channels;

namespace Meowv.Api.Modules.XiaomiCamera.Protocol;

/// <summary>在已建立 CS2 relay 上维护 PPPP 控制通道，并负责链路、保活和 DRW 确认。</summary>
public sealed class Cs2PpppConnection(Cs2RelaySession relaySession, Cs2RelayEstablished relay) : IAsyncDisposable
{
    public const byte CommandChannel = 0;
    public const byte MediaChannel = 2;
    private readonly Cs2RelaySession _relaySession = relaySession ?? throw new ArgumentNullException(nameof(relaySession));
    private readonly Cs2RelayEstablished _relay = relay ?? throw new ArgumentNullException(nameof(relay));
    private readonly IPEndPoint _localEndpoint = relaySession.GetLocalEndpointForRelay(relay.Relay);
    private readonly Cs2DataChannel _commandChannel = new();
    private readonly Cs2DataChannel _mediaChannel = new();

    private readonly Channel<byte[]> _commands = Channel.CreateBounded<byte[]>(
        new BoundedChannelOptions(64)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = true,
        });

    private readonly SemaphoreSlim _commandSendLock = new(1, 1);

    // 有界排队；满载时中止并重建媒体会话，不能静默丢弃压缩帧后继续解码。
    private readonly Channel<byte[]> _media = Channel.CreateBounded<byte[]>(
        new BoundedChannelOptions(128)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = true,
        });

    private readonly TaskCompletionSource _linked = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly CancellationTokenSource _stopping = new();
    private Task? _receiver;
    private ushort _commandSequence;
    private bool _disposed;

    public void Start()
    {
        ThrowIfDisposed();
        _receiver ??= Task.Run(ReceiveLoopAsync);
    }

    public Task WaitForLinkAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        return _linked.Task.WaitAsync(timeout, cancellationToken);
    }

    public async Task SendCommandAsync(int command, ReadOnlyMemory<byte> body, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        await _commandSendLock.WaitAsync(cancellationToken);
        try
        {
            var message = new byte[8 + body.Length];
            BinaryPrimitives.WriteInt32BigEndian(message, 4 + body.Length);
            BinaryPrimitives.WriteInt32BigEndian(message.AsSpan(4), command);
            body.CopyTo(message.AsMemory(8));

            var payload = new byte[4 + message.Length];
            payload[0] = 0xD1;
            payload[1] = CommandChannel;
            BinaryPrimitives.WriteUInt16BigEndian(payload.AsSpan(2), _commandSequence++);
            message.CopyTo(payload, 4);
            await _relaySession.SendFrameAsync(_relay.Relay, new Cs2Frame(Cs2MessageType.Drw, payload), cancellationToken);
        }
        finally
        {
            _commandSendLock.Release();
        }
    }

    public async Task<Cs2CommandMessage?> ReadCommandAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        using var wait = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _stopping.Token);
        wait.CancelAfter(timeout);
        try
        {
            var message = await _commands.Reader.ReadAsync(wait.Token);
            try
            {
                return message.Length < sizeof(int) ? null : new Cs2CommandMessage(BinaryPrimitives.ReadInt32BigEndian(message), message[sizeof(int)..]);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(message);
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return null;
        }
    }

    public async Task<byte[]?> ReadMediaAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        using var wait = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _stopping.Token);
        wait.CancelAfter(timeout);
        try
        {
            return await _media.Reader.ReadAsync(wait.Token);
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
            while (!_stopping.IsCancellationRequested)
            {
                var received = await _relaySession.ReceiveFrameAsync(TimeSpan.FromSeconds(2), _stopping.Token);
                if (received is null)
                {
                    continue;
                }

                if (!received.Value.Sender.Equals(_relay.Relay)) continue;
                await DispatchAsync(received.Value.Frame, _stopping.Token);
            }
        }
        catch (OperationCanceledException) when (_stopping.IsCancellationRequested)
        {
            // 正常关闭。
        }
        catch (Exception exception)
        {
            _linked.TrySetException(exception);
            _commands.Writer.TryComplete(exception);
            _media.Writer.TryComplete(exception);
            return;
        }

        _commands.Writer.TryComplete();
        _media.Writer.TryComplete();
    }

    private async Task DispatchAsync(Cs2Frame frame, CancellationToken cancellationToken)
    {
        switch (frame.Type)
        {
            case Cs2MessageType.Drw:
                await HandleDataAsync(frame.Payload, cancellationToken);
                break;
            case Cs2MessageType.Alive:
                await _relaySession.SendFrameAsync(_relay.Relay, new Cs2Frame(Cs2MessageType.AliveAcknowledged, []), cancellationToken);
                break;
            case Cs2MessageType.MissSetup when Cs2MissSetup.IsRequest(frame.Payload):
                var reply = Cs2MissSetup.CreateReply(frame.Payload, _localEndpoint);
                await _relaySession.SendFrameAsync(_relay.Relay, new Cs2Frame(Cs2MessageType.MissSetup, reply), cancellationToken);
                _linked.TrySetResult();
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
        var target = channel switch
        {
            CommandChannel => _commandChannel,
            MediaChannel => _mediaChannel,
            _ => null,
        };
        if (target is not null && !target.Push(sequence, payload.AsSpan(4))) return;

        var acknowledgement = new byte[] { 0xD1, channel, 0, 1, payload[2], payload[3] };
        await _relaySession.SendFrameAsync(_relay.Relay,
            new Cs2Frame(Cs2MessageType.DrwAcknowledged, acknowledgement), cancellationToken);
        if (target is null) return;
        switch (channel)
        {
            case CommandChannel:
            {
                while (target.TryRead(out var message) && message is not null)
                {
                    if (!_commands.Writer.TryWrite(message))
                    {
                        CryptographicOperations.ZeroMemory(message);
                        throw new Cs2ProtocolException("命令响应队列已满，已中止会话。");
                    }
                }

                break;
            }
            case MediaChannel:
            {
                while (target.TryRead(out var message) && message is not null)
                {
                    if (!_media.Writer.TryWrite(message))
                    {
                        CryptographicOperations.ZeroMemory(message);
                        var queuedFrames = _media.Reader.CanCount ? _media.Reader.Count : -1;
                        throw new Cs2ProtocolException($"媒体转码队列已满（{queuedFrames}/128），已中止会话以避免压缩帧丢失。");
                    }
                }

                break;
            }
        }
    }

    private void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(_disposed, this);

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        try
        {
            await _relaySession.SendFrameAsync(_relay.Relay, new Cs2Frame(Cs2MessageType.Close, []), CancellationToken.None);
        }
        catch (Exception)
        {
            // 会话关闭期间的网络错误无需继续传播。
        }

        await _stopping.CancelAsync();
        if (_receiver is not null)
        {
            try
            {
                await _receiver;
            }
            catch (OperationCanceledException)
            {
                // 正常关闭。
            }
        }

        while (_media.Reader.TryRead(out var message))
        {
            CryptographicOperations.ZeroMemory(message);
        }

        while (_commands.Reader.TryRead(out var command))
        {
            CryptographicOperations.ZeroMemory(command);
        }

        _stopping.Dispose();
        _commandSendLock.Dispose();
    }
}

public sealed record Cs2CommandMessage(int Command, byte[] Body);