using Meowv.Api.Core;

namespace Meowv.Api.Modules.Health;

public sealed class HealthModule : IEndpointModule
{
    public string Name => "health";

    public string Description => "服务存活探针。";

    // 端点已迁移至 HealthController；模块保留用于目录归属。
    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
    }
}