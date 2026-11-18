namespace Meowv.Api.Modules.XiaomiCamera;

public sealed class XiaomiPlaybackException(string message, bool retryable) : Exception(message)
{
    public bool Retryable { get; } = retryable;
}