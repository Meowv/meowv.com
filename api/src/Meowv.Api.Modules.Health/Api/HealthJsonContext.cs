using System.Text.Json;
using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Health.Api;

[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(HealthResponse))]
internal partial class HealthJsonContext : JsonSerializerContext;