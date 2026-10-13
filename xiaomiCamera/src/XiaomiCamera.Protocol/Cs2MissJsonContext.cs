using System.Text.Json.Serialization;

namespace XiaomiCamera.Protocol;

internal sealed record Cs2MissAuthenticationRequest(
    [property: JsonPropertyName("public_key")]
    string PublicKey,
    [property: JsonPropertyName("sign")] string Sign,
    [property: JsonPropertyName("uuid")] Guid Uuid,
    [property: JsonPropertyName("support_encrypt")]
    int SupportEncrypt);

[JsonSerializable(typeof(Cs2MissAuthenticationRequest))]
internal partial class Cs2MissJsonContext : JsonSerializerContext;