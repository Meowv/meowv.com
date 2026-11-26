using System.Text.Json;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioUpdatePreferencesRequest
{
    public Dictionary<string, JsonElement>? Preferences { get; set; }
}