using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.Music.Api;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(MusicDeviceRegister))]
[JsonSerializable(typeof(MusicDeviceActivation))]
[JsonSerializable(typeof(MusicDeviceStatus))]
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
[JsonSerializable(typeof(string[]))]
public partial class MusicJsonContext : JsonSerializerContext;