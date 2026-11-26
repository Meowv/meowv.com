namespace Meowv.Api.Modules.Studio.Domain.Desktop;

public sealed class CountdownWidgetConfig : WidgetConfig
{
    public override WidgetType Type => WidgetType.Countdown;

    public string TargetDate { get; set; } = string.Empty;

    public string EventName { get; set; } = string.Empty;
}