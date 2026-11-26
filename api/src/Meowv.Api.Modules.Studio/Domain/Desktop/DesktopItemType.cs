using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Domain.Desktop;

[JsonConverter(typeof(StudioEnumConverter<DesktopItemType>))]
public enum DesktopItemType
{
    App,
    Link,
    Folder,
    Widget
}