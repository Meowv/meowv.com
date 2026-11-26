using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Domain.Desktop;

[JsonConverter(typeof(StudioEnumConverter<WidgetType>))]
public enum WidgetType
{
    Calendar,
    Weather,
    Countdown,
    SystemMonitor,
    Clock,
    ItTools,
    StickyNote,
    Stock,
    ExchangeRate,
    Calculator,
    GithubTrending,
    BilibiliHot,
    XiaohongshuHot,
    WeiboHot,
    BbcNews
}