using System.Security.Cryptography;
using System.Diagnostics;
using Meowv.Api.Modules.XiaomiCamera.Cloud;
using Meowv.Api.Modules.XiaomiCamera.Protocol;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>打开一次临时直播会话；媒体、密钥和连接材料仅在内存中存活。</summary>
public sealed class XiaomiLiveStreamService(XiaomiCredentialCache credentialCache, XiaomiCameraDirectoryService directory, IHttpClientFactory httpClients, ILogger<XiaomiLiveStreamService> logger)
{
    public async Task<XiaomiLiveStream> OpenAsync(string fingerprint, long expectedSessionVersion, CancellationToken cancellationToken)
    {
        var total = Stopwatch.StartNew();
        var credentials = credentialCache.TryLoad(out var sessionVersion) ?? throw new XiaomiLiveStreamException("没有可用的小米登录会话，请先在初始化页登录。", false);
        if (sessionVersion != expectedSessionVersion)
        {
            throw new XiaomiLiveStreamException("小米登录会话已变更，请重新创建播放会话。", false);
        }

        cancellationToken.ThrowIfCancellationRequested();
        var stage = Stopwatch.StartNew();
        var camera = await directory.FindAsync(credentials, fingerprint, cancellationToken);
        LogStage("设备目录查询", stage, total);
        if (camera is null || !camera.Camera.IsOnline)
        {
            throw new XiaomiLiveStreamException("目标摄像机不存在或当前离线。", false);
        }

        using var keyPair = Cs2KeyPair.Create();
        var catalog = new XiaomiCloudCameraCatalog(httpClients.CreateClient("xiaomi-cloud"), credentials);
        stage.Restart();
        var provisioning = await catalog.ProvisionCs2Async(camera.Camera, keyPair, cancellationToken);
        LogStage("CS2 会话准备", stage, total);
        var relay = new Cs2RelaySession(provisioning);
        try
        {
            stage.Restart();
            var established = await relay.ConnectAsync(TimeSpan.FromSeconds(40), cancellationToken);
            LogStage("CS2 中继连接", stage, total);
            var pppp = new Cs2PpppConnection(relay, established);
            pppp.Start();
            stage.Restart();
            await pppp.WaitForLinkAsync(TimeSpan.FromSeconds(12), cancellationToken);
            LogStage("设备链路建立", stage, total);
            var miss = new Cs2MissClient(pppp);
            stage.Restart();
            await miss.AuthenticateAsync(provisioning, TimeSpan.FromSeconds(20), cancellationToken);
            LogStage("MISS 鉴权", stage, total);
            var sessionKey = Cs2MissCrypto.DeriveSessionKey(keyPair, provisioning.DevicePublicKey);
            try
            {
                stage.Restart();
                await miss.StartVideoAsync(sessionKey, quality: 2, enableAudio: true, cancellationToken: cancellationToken);
                LogStage("音视频请求启动", stage, total);
                return new XiaomiLiveStream(relay, pppp, miss, sessionKey, camera.Camera.Model, logger);
            }
            catch
            {
                CryptographicOperations.ZeroMemory(sessionKey);
                await pppp.DisposeAsync();
                throw;
            }
        }
        catch
        {
            relay.Dispose();
            throw;
        }
    }

    private void LogStage(string name, Stopwatch stage, Stopwatch total) =>
        logger.LogInformation("摄像头连接阶段完成：{Stage}耗时 {StageElapsedMs} ms，累计 {TotalElapsedMs} ms", name, stage.ElapsedMilliseconds, total.ElapsedMilliseconds);
}

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

public sealed class XiaomiLiveStreamException(string message, bool retryable) : Exception(message)
{
    public bool Retryable { get; } = retryable;
}