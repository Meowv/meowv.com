using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.XiaomiCamera.Infrastructure.Cloud;

internal sealed record XiaomiTransportVendorRequest(
    [property: JsonPropertyName("app_pubkey")]
    string AppPublicKey,
    [property: JsonPropertyName("did")] string DeviceId,
    [property: JsonPropertyName("support_vendors")]
    string SupportVendors);