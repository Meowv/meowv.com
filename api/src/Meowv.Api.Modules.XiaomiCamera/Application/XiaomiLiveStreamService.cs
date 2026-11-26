using System.Security.Cryptography;
using System.Diagnostics;

namespace Meowv.Api.Modules.XiaomiCamera.Application;

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
        Cs2PpppConnection? pppp = null;
        byte[]? sessionKey = null;
        var transferred = false;
        try
        {
            stage.Restart();
            var established = await relay.ConnectAsync(TimeSpan.FromSeconds(40), cancellationToken);
            LogStage("CS2 中继连接", stage, total);
            pppp = new Cs2PpppConnection(relay, established);
            pppp.Start();
            stage.Restart();
            await pppp.WaitForLinkAsync(TimeSpan.FromSeconds(12), cancellationToken);
            LogStage("设备链路建立", stage, total);
            var miss = new Cs2MissClient(pppp);
            stage.Restart();
            await miss.AuthenticateAsync(provisioning, TimeSpan.FromSeconds(20), cancellationToken);
            LogStage("MISS 鉴权", stage, total);
            sessionKey = Cs2MissCrypto.DeriveSessionKey(keyPair, provisioning.DevicePublicKey);
            stage.Restart();
            await miss.StartVideoAsync(sessionKey, quality: 2, enableAudio: true, cancellationToken: cancellationToken);
            LogStage("音视频请求启动", stage, total);
            var stream = new XiaomiLiveStream(relay, pppp, miss, sessionKey, camera.Camera.Model, logger);
            transferred = true;
            sessionKey = null;
            pppp = null;
            return stream;
        }
        catch
        {
            if (sessionKey is not null) CryptographicOperations.ZeroMemory(sessionKey);
            throw;
        }
        finally
        {
            if (!transferred)
            {
                if (pppp is not null)
                {
                    try
                    {
                        await pppp.DisposeAsync();
                    }
                    catch
                    {
                        // 建链失败时资源清理不应覆盖原始错误
                    }
                }

                relay.Dispose();
            }
        }
    }

    private void LogStage(string name, Stopwatch stage, Stopwatch total) =>
        logger.LogInformation("摄像头连接阶段完成：{Stage}耗时 {StageElapsedMs} ms，累计 {TotalElapsedMs} ms", name, stage.ElapsedMilliseconds, total.ElapsedMilliseconds);
}