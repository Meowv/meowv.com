namespace Meowv.Api.Modules.Studio.Domain.Desktop;

public sealed class StickyNoteWidgetConfig : WidgetConfig
{
    public override WidgetType Type => WidgetType.StickyNote;

    public string? Content { get; set; }

    public string? Color { get; set; }
}