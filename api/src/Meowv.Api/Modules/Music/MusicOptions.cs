namespace Meowv.Api.Modules.Music;

public sealed class MusicOptions
{
    public bool Enabled { get; set; }
    public string RecommendationFallbackQuery { get; set; } = "华语流行";
    public string TestAccessToken { get; set; } = "";
    public int RequestsPerMinute { get; set; } = 60;
    public int MaxConcurrentRequests { get; set; } = 4;
    internal bool BindingFailed { get; set; }
}