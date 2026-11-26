namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioInitializationService(StudioDatabase database, StudioOptions options) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (options.Enabled) database.Initialize();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }
}