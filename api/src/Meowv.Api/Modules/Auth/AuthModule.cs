using Meowv.Api.Core;

namespace Meowv.Api.Modules.Auth;

public sealed class AuthModule : IEndpointModule
{
    public string Name => "auth";
    public string Description => "应用授权码管理。";

    // 端点已迁移至 AuthController；模块保留用于目录归属。
    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
    }
}
