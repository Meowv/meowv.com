using Meowv.Api.Infrastructure;
using Microsoft.Extensions.Options;

namespace Meowv.Api.Modules.Chat;

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
                throw new InvalidOperationException("启用 Chat 需要配置 Cors:AllowedOrigins。");
            repository.Initialize();
            Ready = true;
        }
        catch (Exception)
        {
            logger.LogError("Chat 模块初始化失败，请检查模块配置及数据库结构与可用性。");
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
                    // 每轮只删除有限记录；有积压时后续轮次继续，避免长事务。
                    var count = repository.Cleanup();
                    logger.LogInformation("Chat 已清理 {Count} 条过期记录。", count);
                    nextCleanup = DateTimeOffset.UtcNow.AddMinutes(count >= options.CleanupBatchSize ? 1 : options.CleanupMinutes);
                }
                catch (Exception)
                {
                    logger.LogWarning("Chat 过期清理未完成，将在下一轮重试。");
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