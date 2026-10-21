using Meowv.Api.Infrastructure;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>可选模块自行预检依赖；初始化失败只影响本模块，不使整个 API 宿主退出。</summary>
public sealed class XiaomiModuleRuntime(IServiceProvider services, ILogger<XiaomiModuleRuntime> logger) : IHostedService
{
    private string _status = "starting";
    private string? _failureReason;
    private XiaomiHlsService? _hls;
    public string Status => Volatile.Read(ref _status);
    public bool IsReady => Status == "ready";
    public string? FailureReason => Volatile.Read(ref _failureReason);

    public Task StartAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var stage = "配置校验";
        try
        {
            var options = services.GetRequiredService<XiaomiCameraOptions>();
            stage = "数据库初始化";
            _ = services.GetRequiredService<XiaomiCredentialCache>();
            stage = "FFmpeg 预检";
            var ffmpeg = services.GetRequiredService<XiaomiFfmpegResolver>();
            stage = "媒体服务初始化";
            _hls = services.GetRequiredService<XiaomiHlsService>();
            logger.LogInformation("小米摄像头模块已就绪，FFmpeg 来源：{Source}，媒体档位：{Profile}", ffmpeg.Source, options.MediaProfile.Name);
            logger.LogInformation(
                "媒体档位配置：{Profile}，最大画幅 {MaximumWidth}x{MaximumHeight}，帧率目标上限 {MaximumFps} fps，目标/峰值码率 {TargetBitrate}/{PeakBitrate} kbps，编码预设 {Preset}",
                options.MediaProfile.Name, options.MediaProfile.MaximumWidth, options.MediaProfile.MaximumHeight,
                options.MediaProfile.MaximumFramesPerSecond, options.MediaProfile.TargetBitrateKbps,
                options.MediaProfile.PeakBitrateKbps, options.MediaProfile.EncoderPreset);
            Volatile.Write(ref _failureReason, null);
            Volatile.Write(ref _status, "ready");
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            // 只输出受控的阶段和版本信息，不暴露第三方异常中的配置值、路径或凭据。
            var reason = exception is ApiDatabaseSchemaException schema
                ? $"摄像头数据库结构不兼容：当前版本 {schema.ActualVersion}，程序要求版本 {schema.ExpectedVersion}。请先备份，再重新初始化摄像头数据库结构并登录小米账号。"
                : $"小米摄像头模块在“{stage}”阶段初始化失败，请检查对应配置。";
            Volatile.Write(ref _failureReason, reason);
            logger.LogError("{Reason} 错误类型：{ExceptionType}", reason, exception.GetType().Name);
            Volatile.Write(ref _status, "unavailable");
        }

        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        Volatile.Write(ref _status, "stopping");
        if (_hls is not null) await _hls.StopAsync(cancellationToken);
    }
}

internal sealed record XiaomiEndpointMetadata;

/// <summary>在端点绑定业务依赖之前拦截，避免不可用模块重复构造失败的依赖。</summary>
internal sealed class XiaomiModuleAvailabilityMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, XiaomiModuleRuntime runtime)
    {
        if (context.GetEndpoint()?.Metadata.GetMetadata<XiaomiEndpointMetadata>() is not null && !runtime.IsReady)
        {
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(
                new XiaomiSetupError("xiaomi_module_unavailable", runtime.FailureReason ?? "小米摄像头模块尚未就绪，请检查服务端配置与 FFmpeg。"),
                XiaomiHttpJsonContext.Default.XiaomiSetupError, cancellationToken: context.RequestAborted);
            return;
        }

        await next(context);
    }
}
