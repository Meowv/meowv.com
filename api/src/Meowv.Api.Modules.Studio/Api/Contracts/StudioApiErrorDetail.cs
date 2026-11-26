using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Studio.Api.Contracts;

public sealed class StudioApiErrorDetail
{
    public StudioApiErrorDetail()
    {
    }

    public StudioApiErrorDetail(string field, string message)
    {
        Field = field;
        Message = message;
    }

    [JsonPropertyName("field")] public string Field { get; set; } = string.Empty;

    [JsonPropertyName("message")] public string Message { get; set; } = string.Empty;
}