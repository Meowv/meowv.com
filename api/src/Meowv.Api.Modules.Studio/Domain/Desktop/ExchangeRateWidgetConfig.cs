namespace Meowv.Api.Modules.Studio.Domain.Desktop;

public sealed class ExchangeRateWidgetConfig : WidgetConfig
{
    public override WidgetType Type => WidgetType.ExchangeRate;

    public List<ExchangeRatePair>? Pairs { get; set; }
}