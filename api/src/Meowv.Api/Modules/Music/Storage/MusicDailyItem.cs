using Meowv.Api.Modules.Music.Contracts;

namespace Meowv.Api.Modules.Music.Storage;

internal sealed record MusicDailyItem(MusicTrack Track, MusicDailyRank[] Ranks);