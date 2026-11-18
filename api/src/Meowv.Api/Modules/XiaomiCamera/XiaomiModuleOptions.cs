namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>由公共配置提供的模块选项；只在模块启用时绑定和校验。</summary>
public sealed class XiaomiModuleOptions
{
    public bool Enabled { get; set; } = true;
    public int MaxConcurrentStreams { get; set; } = 2;
    public XiaomiMediaOptions Media { get; set; } = new();
}