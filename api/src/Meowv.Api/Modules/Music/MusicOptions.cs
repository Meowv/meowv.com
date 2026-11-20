namespace Meowv.Api.Modules.Music;

public sealed class MusicOptions
{
    public bool Enabled { get; set; }
    public string QQMusicSkillApiKey { get; set; } = "";
    public bool RollingRecommendationsEnabled { get; set; }
    public bool QQMusicMemberEnabled { get; set; }
    public string QQMusicSessionKey { get; set; } = "";
    public int RequestsPerMinute { get; set; } = 60;
    public int MaxConcurrentRequests { get; set; } = 4;
    internal bool BindingFailed { get; set; }
}