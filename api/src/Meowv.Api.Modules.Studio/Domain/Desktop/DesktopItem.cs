using System.Text.Json;
using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Domain.Desktop;

public sealed class DesktopItem
{
    public string Id { get; set; } = string.Empty;

    public DesktopItemType Type { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Url { get; set; }

    public string? Icon { get; set; }

    public string? IconColor { get; set; }

    public List<DesktopItem>? Children { get; set; }

    public WidgetType? WidgetType { get; set; }

    public WidgetSize? WidgetSize { get; set; }

    public WidgetConfig? WidgetConfig { get; set; }

    public int? WidgetOpacity { get; set; }

    [JsonExtensionData] public Dictionary<string, JsonElement>? ExtraFields { get; set; }
}