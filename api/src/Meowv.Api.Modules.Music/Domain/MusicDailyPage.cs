namespace Meowv.Api.Modules.Music.Domain;

internal sealed record MusicDailyPage(string Chart, DateOnly Period, MusicDailySource[] Sources, MusicDailyItem[] Items, bool Partial, string[] Warnings);
