using System.Text.Json.Serialization;

namespace Meowv.Api.Security;

public sealed record ApiAuthError(string Code, string Message);

public sealed record AccessCodeResponse(string? AccessCode);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ApiAuthError))]
[JsonSerializable(typeof(AccessCodeResponse))]
internal partial class AuthJsonContext : JsonSerializerContext;