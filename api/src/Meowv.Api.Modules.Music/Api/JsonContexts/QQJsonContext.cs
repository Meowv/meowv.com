using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Music.Api.JsonContexts;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(QQAccountClient.Credential))]
[JsonSerializable(typeof(QQLoginAttempt))]
[JsonSerializable(typeof(QQSessionStatus))]
[JsonSerializable(typeof(QQDeviceGrant))]
internal sealed partial class QQJsonContext : JsonSerializerContext;