namespace Meowv.Api.Modules.Studio.Domain.Desktop;

public sealed class StockWidgetConfig : WidgetConfig
{
    public override WidgetType Type => WidgetType.Stock;

    public List<StockItem>? Watchlist { get; set; }
}