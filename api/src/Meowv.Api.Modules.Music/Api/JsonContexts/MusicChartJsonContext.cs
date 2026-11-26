using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Music.Api.JsonContexts;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(MusicChartEntry[]))]
[JsonSerializable(typeof(MusicDailyPage))]
internal partial class MusicChartJsonContext : JsonSerializerContext;