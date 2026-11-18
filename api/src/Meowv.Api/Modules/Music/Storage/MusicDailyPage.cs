namespace Meowv.Api.Modules.Music.Storage;

internal sealed record MusicDailyPage(string Chart, DateOnly Period, MusicDailySource[] Sources, MusicDailyItem[] Items, bool Partial, string[] Warnings);