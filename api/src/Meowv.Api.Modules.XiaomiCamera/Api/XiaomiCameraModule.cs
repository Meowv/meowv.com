namespace Meowv.Api.Modules.XiaomiCamera.Api;

public sealed class XiaomiCameraModule : IEndpointModule
{
    public const string ApiPrefix = "/api/xiaomi-camera";

    public string Name => "xiaomi-camera";

    public string Description => "小米摄像头登录、设备目录与实时播放。";

    public void ConfigureMiddleware(IApplicationBuilder application) => application.UseMiddleware<XiaomiModuleAvailabilityMiddleware>();
}