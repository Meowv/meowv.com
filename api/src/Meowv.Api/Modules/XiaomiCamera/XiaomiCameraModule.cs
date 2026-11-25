using Meowv.Api.Core;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>小米摄像头模块：保留模块身份与可用性中间件，端点已迁移至 MVC 控制器。</summary>
public sealed class XiaomiCameraModule : IEndpointModule
{
    public const string ApiPrefix = "/api/xiaomi-camera";
    internal const string CorsPolicy = ApiAuthorization.CorsPolicy;
    public string Name => "xiaomi-camera";
    public string Description => "小米摄像头登录、设备目录与实时播放。";

    public void ConfigureMiddleware(IApplicationBuilder application) =>
        application.UseMiddleware<XiaomiModuleAvailabilityMiddleware>();

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
    }
}
