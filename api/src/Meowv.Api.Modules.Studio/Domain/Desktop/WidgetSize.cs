using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Domain.Desktop;

[JsonConverter(typeof(StudioEnumConverter<WidgetSize>))]
public enum WidgetSize
{
    Small,
    Medium,
    Large,
    Tall,
    XLarge
}