namespace Meowv.Api.Modules.XiaomiCamera.Domain;

public sealed class XiaomiPlaybackException(string message, bool retryable) : Exception(message)
{
    public bool Retryable { get; } = retryable;
}