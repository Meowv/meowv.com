namespace Meowv.Api.Modules.Studio.Application.Ports;

public interface IStudioEmailSender
{
    bool IsConfigured { get; }

    Task SendAsync(StudioOutboxMessage message, CancellationToken cancellationToken);
}