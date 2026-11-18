namespace Meowv.Api.Modules.Music.Contracts;

public sealed record MusicError(string Code, string Message, bool Retryable, int? RetryAfterSeconds, string RequestId);