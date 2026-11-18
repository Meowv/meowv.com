namespace Meowv.Api.Modules.Music;

public sealed class MusicException(string code, string message, int status = 400, int? retryAfterSeconds = null) : Exception(message)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
    public int? RetryAfterSeconds { get; } = retryAfterSeconds;
    public static MusicException Invalid() => new("invalid_request", "音乐请求参数无效。");
}