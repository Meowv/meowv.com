namespace Meowv.Api.Modules.Chat.Infrastructure;

public sealed class ChatRuntime(ChatRepository repository, ChatOptions options, ChatPresenceService presence, IOptions<ApiCorsOptions> cors, ILogger<ChatRuntime> logger) : BackgroundService
{
    public bool Ready { get; private set; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Enabled) return;
        try
        {
            options.Validate();
            if (cors.Value.AllowedOrigins.Length == 0 || !ApiCorsOptions.IsValid(cors.Value))
            {
                logger.LogWarning("Chat 未就绪：启用 Chat 时必须配置 Cors:AllowedOrigins。");
                throw new InvalidOperationException("启用 Chat 需要配置 Cors:AllowedOrigins。");
            }

            repository.Initialize();
            Ready = true;
        }
        catch (Exception error)
        {
            ChatDiagnostics.Failure(logger, error, "initialize", ChatDiagnostics.CorrelationId);
            return;
        }

        var nextCleanup = DateTimeOffset.MinValue;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        try
        {
            do
            {
                presence.Expire();
                if (DateTimeOffset.UtcNow < nextCleanup) continue;
                try
                {
                    var count = repository.Cleanup();
                    logger.LogInformation("Chat 已清理 {Count} 条过期记录。", count);
                    nextCleanup = DateTimeOffset.UtcNow.AddMinutes(count >= options.CleanupBatchSize ? 1 : options.CleanupMinutes);
                }
                catch (Exception error)
                {
                    ChatDiagnostics.Failure(logger, error, "cleanup", ChatDiagnostics.CorrelationId);
                }
            } while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        finally
        {
            Ready = false;
        }
    }
}