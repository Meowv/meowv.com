using System.Text.Json.Serialization;
using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(MusicDeviceRequest))]
[JsonSerializable(typeof(MusicDeviceIssued))]
[JsonSerializable(typeof(MusicDevice[]))]
[JsonSerializable(typeof(MusicHealth))]
[JsonSerializable(typeof(MusicProviders))]
[JsonSerializable(typeof(MusicSearchPage))]
[JsonSerializable(typeof(MusicRecommendationPage))]
[JsonSerializable(typeof(MusicResolveRequest))]
[JsonSerializable(typeof(MusicResolvedTrack))]
[JsonSerializable(typeof(MusicErrorResponse))]
[JsonSerializable(typeof(MusicLyrics))]
[JsonSerializable(typeof(string))]
public partial class MusicJsonContext : JsonSerializerContext;