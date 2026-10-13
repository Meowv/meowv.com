using System.Security.Cryptography;
using System.Diagnostics;
using XiaomiCamera.Cloud;
using XiaomiCamera.Protocol;

namespace XiaomiCamera;

/// <summary>打开一次临时直播会话；媒体、密钥和连接材料仅在内存中存活。</summary>
public sealed class XiaomiLiveStreamService(XiaomiCredentialCache credentialCache, XiaomiCameraDirectoryService directory, IHttpClientFactory httpClients, ILogger<XiaomiLiveStreamService> logger)
{
    public async Task<XiaomiLiveStream> OpenAsync(string fingerprint, CancellationToken cancellationToken)
    {
        var total = Stopwatch.StartNew();
        var credentials = credentialCache.TryLoad() ?? throw new XiaomiLiveStreamException("没有可用的小米登录会话，请先在初始化页登录。", false);
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
                await miss.StartVideoAsync(sessionKey, quality: 2, cancellationToken);
                LogStage("视频请求启动", stage, total);
                return new XiaomiLiveStream(relay, pppp, miss, sessionKey);
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
    private readonly Cs2RelaySession relay;
    private readonly Cs2PpppConnection pppp;
    private readonly Cs2MissClient miss;
    private readonly byte[] sessionKey;
    private bool disposed;

    internal XiaomiLiveStream(Cs2RelaySession relay, Cs2PpppConnection pppp, Cs2MissClient miss, byte[] sessionKey)
    {
        this.relay = relay;
        this.pppp = pppp;
        this.miss = miss;
        this.sessionKey = sessionKey;
    }

    public async IAsyncEnumerable<Cs2MediaPacket> ReadMediaFramesAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var message = await pppp.ReadMediaAsync(TimeSpan.FromSeconds(20), cancellationToken);
            if (message is null)
            {
                throw new XiaomiLiveStreamException("视频流在 20 秒内未收到媒体数据。", true);
            }

            try
            {
                yield return Cs2MediaPacket.Parse(message, sessionKey);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(message);
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (disposed)
        {
            return;
        }

        disposed = true;
        try
        {
            await miss.StopVideoAsync(sessionKey, CancellationToken.None);
        }
        catch (Exception)
        {
            // 断开 UDP 会话仍会停止设备端推送。
        }

        CryptographicOperations.ZeroMemory(sessionKey);
        await pppp.DisposeAsync();
        relay.Dispose();
    }
}

public sealed class XiaomiLiveStreamException(string message, bool retryable) : Exception(message)
{
    public bool Retryable { get; } = retryable;
}