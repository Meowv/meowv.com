namespace Meowv.Api.Modules.Studio.Domain.Desktop;

public sealed class GithubTrendingWidgetConfig : WidgetConfig
{
    public override WidgetType Type => WidgetType.GithubTrending;

    public string? Language { get; set; }

    public string? Since { get; set; }
}