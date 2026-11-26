using System.Text.Json;

namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioPreferencesDocument
{
    public Dictionary<string, JsonElement> Preferences { get; set; } = [];

    public DateTimeOffset? UpdatedAt { get; set; }
}