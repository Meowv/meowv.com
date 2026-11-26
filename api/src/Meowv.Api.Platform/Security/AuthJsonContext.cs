using System.Text.Json.Serialization;

namespace Meowv.Api.Platform.Security;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ApiAuthError))]
public partial class AuthJsonContext : JsonSerializerContext;