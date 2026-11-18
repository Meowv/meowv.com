namespace Meowv.Api.Modules.Music.Contracts;

public sealed record MusicHealth(string Status, int EnabledProviderCount, string ConfigVersion);