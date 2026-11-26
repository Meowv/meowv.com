namespace Meowv.Api.Modules.Music.Api;

public sealed class MusicModule : IEndpointModule
{
    public string Name => "music";

    public string Description => "音乐搜索、候选与播放资源解析。";

    public void ConfigureMiddleware(IApplicationBuilder application) => application.UseMiddleware<MusicMiddleware>();
}