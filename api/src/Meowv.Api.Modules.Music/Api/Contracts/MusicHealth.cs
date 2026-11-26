namespace Meowv.Api.Modules.Music.Api.Contracts;

public sealed record MusicHealth(string Status, int EnabledProviderCount, string ConfigVersion);