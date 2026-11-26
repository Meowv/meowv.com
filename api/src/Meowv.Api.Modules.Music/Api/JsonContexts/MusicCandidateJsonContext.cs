using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Music.Api.JsonContexts;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(MusicCandidateState))]
internal sealed partial class MusicCandidateJsonContext : JsonSerializerContext;