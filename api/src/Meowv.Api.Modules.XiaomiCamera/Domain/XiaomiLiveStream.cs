using System.Security.Cryptography;
using System.Diagnostics;

namespace Meowv.Api.Modules.XiaomiCamera.Domain;

public sealed class XiaomiLiveStream : IAsyncDisposable
{
    private readonly Cs2RelaySession _relay;
    private readonly Cs2PpppConnection _pppp;
    private readonly Cs2MissClient _miss;
    private readonly byte[] _sessionKey;
    private readonly ILogger _logger;
    private readonly CancellationTokenSource _lifetime = new();
    private readonly SemaphoreSlim _commandLock = new(1, 1);
    private readonly Task _commandReader;
    private readonly Stopwatch _audioWait = Stopwatch.StartNew();
    private bool _audioSeen;
    private bool _audioAsked;
    private readonly HashSet<int> _unknownCodecs = [];
    private bool _disposed;

    internal XiaomiLiveStream(Cs2RelaySession relay, Cs2PpppConnection pppp, Cs2MissClient miss, byte[] sessionKey, string model, ILogger logger)
    {
        _relay = relay;
        _pppp = pppp;
        _miss = miss;
        _sessionKey = sessionKey;
        _logger = logger;
        Model = model;
        _commandReader = Task.Run(DrainCommandsAsync);
    }

    public string Model { get; }

    public async Task MotorStepAsync(int operation, CancellationToken cancellationToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _lifetime.Token);
        await _commandLock.WaitAsync(linked.Token);
        try
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            await _miss.MotorStepAsync(_sessionKey, operation, linked.Token);
        }
        finally
        {
            _commandLock.Release();
        }
    }

    public async IAsyncEnumerable<Cs2MediaPacket> ReadMediaFramesAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var message = await _pppp.ReadMediaAsync(TimeSpan.FromSeconds(20), cancellationToken);
            if (message is null)
            {
                throw new XiaomiLiveStreamException("视频流在 20 秒内未收到媒体数据。", true);
            }

            try
            {
                var packet = Cs2MediaPacket.Parse(message, _sessionKey);
                if (packet.IsAudio && !_audioSeen)
                {
                    _audioSeen = true;
                    _logger.LogInformation("收到摄像头音频帧，编码 {Codec}，采样率标志 {SampleRate} Hz，时间戳 {TimestampMs} ms", packet.CodecName, packet.AudioSampleRate, packet.TimestampMilliseconds);
                }

                if (packet is { IsVideo: false, IsAudio: false } && _unknownCodecs.Count < 16 && _unknownCodecs.Add(packet.CodecId))
                {
                    _logger.LogInformation("收到尚未识别的摄像头媒体编码 ID {CodecId}，标志 {Flags}", packet.CodecId, packet.Flags);
                }

                if (!_audioSeen && !_audioAsked && _audioWait.Elapsed >= TimeSpan.FromSeconds(3))
                {
                    _audioAsked = true;
                    try
                    {
                        await _miss.StartAudioAsync(_sessionKey, cancellationToken);
                    }
                    catch
                    {
                        CryptographicOperations.ZeroMemory(packet.Payload);
                        throw;
                    }

                    _logger.LogInformation("未收到音频帧，已补发 MISS 音频请求");
                }

                yield return packet;
            }
            finally
            {
                CryptographicOperations.ZeroMemory(message);
            }
        }
    }

    private async Task DrainCommandsAsync()
    {
        try
        {
            while (!_lifetime.IsCancellationRequested)
            {
                var reply = await _pppp.ReadCommandAsync(TimeSpan.FromSeconds(2), _lifetime.Token);
                if (reply is null)
                {
                    continue;
                }

                try
                {
                    if (reply.Command == Cs2MissClient.EncryptedCommand)
                    {
                        try
                        {
                            var plaintext = Cs2MissCrypto.Decrypt(_sessionKey, reply.Body);
                            CryptographicOperations.ZeroMemory(plaintext);
                        }
                        catch (Cs2ProtocolException)
                        {
                            // 单条异常响应不应停止命令通道的持续消费。
                        }
                    }
                }
                finally
                {
                    CryptographicOperations.ZeroMemory(reply.Body);
                }
            }
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested)
        {
        }
        catch (System.Threading.Channels.ChannelClosedException)
        {
        }
        catch (Exception exception)
        {
            _logger.LogWarning("摄像头命令接收已停止：{ExceptionType}", exception.GetType().Name);
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        await _lifetime.CancelAsync();
        await _commandReader;
        await _commandLock.WaitAsync();
        try
        {
            await _miss.StopVideoAsync(_sessionKey, CancellationToken.None);
        }
        catch (Exception)
        {
            // 断开 UDP 会话仍会停止设备端推送。
        }

        try
        {
            CryptographicOperations.ZeroMemory(_sessionKey);
            await _pppp.DisposeAsync();
        }
        finally
        {
            _relay.Dispose();
            _commandLock.Release();
            _commandLock.Dispose();
            _lifetime.Dispose();
        }
    }
}