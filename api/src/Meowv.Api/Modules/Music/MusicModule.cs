using Meowv.Api.Core;

namespace Meowv.Api.Modules.Music;

public sealed class MusicModule : IEndpointModule
{
    public string Name => "music";

    public string Description => "音乐搜索、候选与播放资源解析。";

    public void ConfigureMiddleware(IApplicationBuilder application) => application.UseMiddleware<MusicMiddleware>();

    // 端点已迁移至 MusicController / MusicQQSetupController；模块保留用于目录归属与中间件。
    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
    }
}
