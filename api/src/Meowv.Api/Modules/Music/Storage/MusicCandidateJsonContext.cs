using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Music.Storage;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(MusicCandidateState))]
internal sealed partial class MusicCandidateJsonContext : JsonSerializerContext;