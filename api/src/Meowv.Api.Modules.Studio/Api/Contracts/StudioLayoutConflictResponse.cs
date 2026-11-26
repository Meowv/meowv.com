using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioLayoutConflictResponse
{
    public string Error { get; set; } = string.Empty;

    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("request_id")] public string? RequestId { get; set; }

    public LayoutEnvelope Current { get; set; } = new();
}