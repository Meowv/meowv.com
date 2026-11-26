namespace Meowv.Api.Modules.Studio.Domain.Desktop;

public sealed class ClockWidgetConfig : WidgetConfig
{
    public override WidgetType Type => WidgetType.Clock;

    public string? Timezone { get; set; }
}