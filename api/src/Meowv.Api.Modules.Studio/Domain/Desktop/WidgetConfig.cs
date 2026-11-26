using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Domain.Desktop;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "widgetType")]
[JsonDerivedType(typeof(CalendarWidgetConfig), "calendar")]
[JsonDerivedType(typeof(WeatherWidgetConfig), "weather")]
[JsonDerivedType(typeof(CountdownWidgetConfig), "countdown")]
[JsonDerivedType(typeof(SystemMonitorWidgetConfig), "systemMonitor")]
[JsonDerivedType(typeof(ClockWidgetConfig), "clock")]
[JsonDerivedType(typeof(ItToolsWidgetConfig), "itTools")]
[JsonDerivedType(typeof(StickyNoteWidgetConfig), "stickyNote")]
[JsonDerivedType(typeof(StockWidgetConfig), "stock")]
[JsonDerivedType(typeof(ExchangeRateWidgetConfig), "exchangeRate")]
[JsonDerivedType(typeof(CalculatorWidgetConfig), "calculator")]
[JsonDerivedType(typeof(GithubTrendingWidgetConfig), "githubTrending")]
[JsonDerivedType(typeof(BilibiliHotWidgetConfig), "bilibiliHot")]
[JsonDerivedType(typeof(XiaohongshuHotWidgetConfig), "xiaohongshuHot")]
[JsonDerivedType(typeof(WeiboHotWidgetConfig), "weiboHot")]
[JsonDerivedType(typeof(BbcNewsWidgetConfig), "bbcNews")]
public abstract class WidgetConfig
{
    [JsonIgnore] public abstract WidgetType Type { get; }
}