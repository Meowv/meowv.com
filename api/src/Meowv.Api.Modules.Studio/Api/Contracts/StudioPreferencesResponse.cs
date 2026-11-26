using System.Text.Json;
using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioPreferencesResponse
{
    public Dictionary<string, JsonElement> Preferences { get; set; } = [];

    [JsonPropertyName("updated_at")] public DateTimeOffset? UpdatedAt { get; set; }
}