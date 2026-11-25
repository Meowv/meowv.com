using Meowv.Api.Core;

namespace Meowv.Api.Modules.Diagnostics;

public sealed class DiagnosticsModule : IEndpointModule
{
    public string Name => "diagnostics";

    public string Description => "已加载模块与接口目录。";

    // 端点已迁移至 DiagnosticsController；模块保留用于目录归属。
    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
    }
}
