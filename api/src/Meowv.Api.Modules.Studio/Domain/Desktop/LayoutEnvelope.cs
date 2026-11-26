using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Domain.Desktop;

public sealed class LayoutEnvelope
{
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public DesktopLayout? Layout { get; set; }

    [JsonPropertyName("updated_at")]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public DateTimeOffset? UpdatedAt { get; set; }

    public long Revision { get; set; }

    public bool Exists { get; set; }
}