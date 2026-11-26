namespace Meowv.Api.Modules.Studio.Api;

public sealed class StudioModule : IEndpointModule
{
    public string Name => "studio";

    public string Description => "Studio 账号、会话与桌面布局。";

    public void ConfigureMiddleware(IApplicationBuilder application)
    {
        application.UseMiddleware<StudioRequestIdMiddleware>();
        application.UseMiddleware<StudioExceptionMiddleware>();
    }
}