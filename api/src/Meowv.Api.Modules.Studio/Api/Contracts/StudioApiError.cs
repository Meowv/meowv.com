using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioApiError
{
    public StudioApiError()
    {
    }

    public StudioApiError(string error, string? code = null, string? requestId = null, List<StudioApiErrorDetail>? details = null)
    {
        Error = error;
        Code = code;
        RequestId = requestId;
        Details = details;
    }

    [JsonPropertyName("error")] public string Error { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Code { get; set; }

    [JsonPropertyName("request_id")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RequestId { get; set; }

    [JsonPropertyName("details")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<StudioApiErrorDetail>? Details { get; set; }
}