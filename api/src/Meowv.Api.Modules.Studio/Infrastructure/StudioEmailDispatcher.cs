namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed partial class StudioEmailDispatcher(
    IStudioStore store,
    IStudioEmailSender sender,
    StudioOptions options,
    ILogger<StudioEmailDispatcher> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Enabled || !sender.IsConfigured) return;

        var interval = TimeSpan.FromSeconds(Math.Clamp(options.DispatcherIntervalSeconds, 5, 300));
        using var timer = new PeriodicTimer(interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            await DispatchAsync(stoppingToken);
            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken)) break;
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task DispatchAsync(CancellationToken cancellationToken)
    {
        var pending = await store.GetPendingEmailsAsync(DateTimeOffset.UtcNow, 20, cancellationToken);
        foreach (var message in pending)
            try
            {
                await sender.SendAsync(message, cancellationToken);
                await store.DeleteOutboxAsync(message.Id, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                var attempts = message.Attempts + 1;
                var delaySeconds = Math.Min(Math.Pow(2, Math.Min(attempts, 12)), 3600);
                await store.RecordOutboxFailureAsync(
                    message.Id,
                    attempts,
                    DateTimeOffset.UtcNow.AddSeconds(delaySeconds),
                    ex.Message,
                    cancellationToken);

                if (attempts >= Math.Max(1, options.DispatcherMaxAttempts))
                    LogAbandoned(message.Id, message.Purpose.ToString(), attempts, ex);
                else
                    LogRetry(message.Id, message.Purpose.ToString(), attempts, ex);
            }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Studio email {Id} ({Purpose}) failed; retry #{Attempts}.")]
    private partial void LogRetry(Guid id, string purpose, int attempts, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "Studio email {Id} ({Purpose}) abandoned after {Attempts} attempts.")]
    private partial void LogAbandoned(Guid id, string purpose, int attempts, Exception exception);
}