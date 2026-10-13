using System.Text.Json.Serialization;

namespace XiaomiCamera.Cloud;

internal sealed record XiaomiTransportVendorRequest(
    [property: JsonPropertyName("app_pubkey")]
    string AppPublicKey,
    [property: JsonPropertyName("did")] string DeviceId,
    [property: JsonPropertyName("support_vendors")]
    string SupportVendors);

[JsonSerializable(typeof(XiaomiTransportVendorRequest))]
internal partial class XiaomiCloudJsonContext : JsonSerializerContext;