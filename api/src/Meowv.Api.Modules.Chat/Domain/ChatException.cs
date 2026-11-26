namespace Meowv.Api.Modules.Chat.Domain;

public sealed class ChatException(string code, string message, int status = 400) : Exception(message)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}