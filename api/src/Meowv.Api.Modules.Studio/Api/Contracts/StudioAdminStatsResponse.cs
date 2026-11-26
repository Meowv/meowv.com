using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioAdminStatsResponse
{
    [JsonPropertyName("user_count")] public int UserCount { get; set; }

    [JsonPropertyName("admin_count")] public int AdminCount { get; set; }

    [JsonPropertyName("verified_count")] public int VerifiedCount { get; set; }

    [JsonPropertyName("active_session_count")]
    public int ActiveSessionCount { get; set; }

    [JsonPropertyName("session_count")] public int SessionCount { get; set; }

    [JsonPropertyName("layout_count")] public int LayoutCount { get; set; }

    [JsonPropertyName("preference_count")] public int PreferenceCount { get; set; }

    [JsonPropertyName("database_bytes")] public long DatabaseBytes { get; set; }

    [JsonPropertyName("database_note")] public string DatabaseNote { get; set; } = string.Empty;
}