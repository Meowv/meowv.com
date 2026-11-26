namespace Meowv.Api.Modules.Auth.Infrastructure;

internal sealed class AuthInitializationService(IAccessCodeService codes) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _ = codes.GetVersion();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}