using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;

namespace Meowv.Api.Modules.Chat.Infrastructure;

public sealed class ChatBroadcastQueue(IHubContext<ChatHub> hub, ChatPresenceService presence, ILogger<ChatBroadcastQueue> logger) : BackgroundService
{
    private sealed record Broadcast(string Event, object Payload, string CorrelationId);

    private readonly Channel<Broadcast> _queue = Channel.CreateBounded<Broadcast>(new BoundedChannelOptions(128) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
    private readonly SemaphoreSlim _capacity = new(128, 128);
    private volatile bool _stopping;
    internal TimeSpan SendTimeout { get; set; } = TimeSpan.FromSeconds(3);

    internal Reservation Reserve()
    {
        if (_stopping || !_capacity.Wait(0)) throw new ChatException("chat_busy", "实时消息繁忙，请稍后重试。", 503);
        return new Reservation(this);
    }

    internal sealed class Reservation(ChatBroadcastQueue owner) : IDisposable
    {
        private bool _published;

        public void Publish(string eventName, object payload)
        {
            if (_published) throw new InvalidOperationException("广播预留已使用。");
            owner._queue.Writer.TryWrite(new Broadcast(eventName, payload, ChatDiagnostics.CorrelationId));
            _published = true;
        }

        public void Dispose()
        {
            if (!_published) owner._capacity.Release();
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var item in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    var connections = presence.Connections;
                    var sends = connections.Select(async connection =>
                    {
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                        timeout.CancelAfter(SendTimeout);
                        var sending = hub.Clients.Client(connection.Id).SendCoreAsync(item.Event, [item.Payload], timeout.Token);
                        try
                        {
                            await sending.WaitAsync(timeout.Token);
                        }
                        catch (Exception error)
                        {
                            _ = sending.ContinueWith(task => { _ = task.Exception; }, TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously);
                            if (stoppingToken.IsCancellationRequested) return;
                            ChatDiagnostics.Failure(logger, error, item.Event, item.CorrelationId);
                            presence.AbortConnection(connection.Id);
                        }
                    });
                    await Task.WhenAll(sends);
                }
                catch (Exception error)
                {
                    ChatDiagnostics.Failure(logger, error, item.Event, item.CorrelationId);
                }
                finally
                {
                    _capacity.Release();
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    public override Task StopAsync(CancellationToken cancellationToken)
    {
        _stopping = true;
        return base.StopAsync(cancellationToken);
    }
}