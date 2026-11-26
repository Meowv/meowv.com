namespace Meowv.Api.Modules.Studio.Domain.Desktop;

public sealed class WeatherWidgetConfig : WidgetConfig
{
    public override WidgetType Type => WidgetType.Weather;

    public string? City { get; set; }

    public string? Unit { get; set; }
}