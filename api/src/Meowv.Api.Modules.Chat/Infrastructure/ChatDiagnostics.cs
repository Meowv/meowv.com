using System.Diagnostics;

namespace Meowv.Api.Modules.Chat.Infrastructure;

internal static class ChatDiagnostics
{
    internal static string CorrelationId => Activity.Current?.TraceId.ToString() ?? Guid.NewGuid().ToString("N");

    internal static void Failure(ILogger logger, Exception error, string operation, string correlationId) => logger.LogWarning("Chat {Operation} 失败；CorrelationId={CorrelationId} ExceptionType={ExceptionType} StackTrace={StackTrace}", operation, correlationId, error.GetType().FullName, error.StackTrace);
}