namespace Meowv.Api.Modules.Diagnostics.Api;

public sealed class DiagnosticsModule : IEndpointModule
{
    public string Name => "diagnostics";

    public string Description => "已加载模块与接口目录。";
}