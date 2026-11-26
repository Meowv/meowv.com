namespace Meowv.Api.Modules.Studio.Domain.Desktop;

public sealed class DesktopLayout
{
    public List<List<DesktopItem>> Pages { get; set; } = [];

    public List<DesktopItem> Dock { get; set; } = [];
}