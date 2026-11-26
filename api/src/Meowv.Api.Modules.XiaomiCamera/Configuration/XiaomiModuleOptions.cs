namespace Meowv.Api.Modules.XiaomiCamera.Configuration;

public sealed class XiaomiModuleOptions
{
    public bool Enabled { get; set; } = true;
    public int MaxConcurrentStreams { get; set; } = 2;
    public XiaomiMediaOptions Media { get; set; } = new();
}