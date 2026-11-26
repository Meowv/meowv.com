using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioRevokeSessionsRequest
{
    [JsonPropertyName("except_token_id")] public string? ExceptTokenId { get; set; }
}