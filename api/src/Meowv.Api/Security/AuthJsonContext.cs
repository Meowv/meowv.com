using System.Text.Json.Serialization;

namespace Meowv.Api.Security;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ApiAuthError))]
[JsonSerializable(typeof(AccessCodeResponse))]
internal partial class AuthJsonContext : JsonSerializerContext;