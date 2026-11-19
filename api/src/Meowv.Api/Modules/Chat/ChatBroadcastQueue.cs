using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;

namespace Meowv.Api.Modules.Chat;

public sealed class ChatBroadcastQueue(IHubContext<ChatHub> hub, ChatPresenceService presence, ILogger<ChatBroadcastQueue> logger) : BackgroundService
{
    private sealed record Broadcast(string Event, object Payload, string CorrelationId);

    private readonly Channel<Broadcast> _queue = Channel.CreateBounded<Broadcast>(new BoundedChannelOptions(128) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
    private readonly SemaphoreSlim _capacity = new(128, 128);
    private volatile bool _stopping;
    internal TimeSpan SendTimeout { get; set; } = TimeSpan.FromSeconds(3);

    // 在落库前预留容量；满载时拒绝写入，避免保存成功却无法排队。
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
            // Channel 仅在进程退出时停止消费，不在提交与入队之间关闭 writer。
            owner._queue.Writer.TryWrite(new(eventName, payload, ChatDiagnostics.CorrelationId));
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
                        // 每个连接独立超时；一个慢客户端不再拖垮整个聊天室。
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                        timeout.CancelAfter(SendTimeout);
                        var sending = hub.Clients.Client(connection.Id).SendCoreAsync(item.Event, [item.Payload], timeout.Token);
                        try
                        {
                            await sending.WaitAsync(timeout.Token);
                        }
                        catch (Exception error)
                        {
                            // 即使传输实现忽略取消，也观察其最终异常，避免后台任务泄漏诊断。
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