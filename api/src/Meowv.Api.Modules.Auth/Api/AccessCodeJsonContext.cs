using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Auth.Api;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(AccessCodeResponse))]
internal partial class AccessCodeJsonContext : JsonSerializerContext;