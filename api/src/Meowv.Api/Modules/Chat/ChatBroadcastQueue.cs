using System.Diagnostics;
using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;

namespace Meowv.Api.Modules.Chat;

// 不记录异常 Message/InnerException，避免驱动或传输异常夹带正文、连接串等数据。
internal static class ChatDiagnostics
{
    internal static string CorrelationId => Activity.Current?.TraceId.ToString() ?? Guid.NewGuid().ToString("N");

    internal static void Failure(ILogger logger, Exception error, string operation, string correlationId) =>
        logger.LogWarning("Chat {Operation} 失败；CorrelationId={CorrelationId} ExceptionType={ExceptionType} StackTrace={StackTrace}",
            operation, correlationId, error.GetType().FullName, error.StackTrace);
}

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
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                    timeout.CancelAfter(SendTimeout);
                    var sending = hub.Clients.All.SendCoreAsync(item.Event, [item.Payload], timeout.Token);
                    try
                    {
                        await sending.WaitAsync(timeout.Token);
                    }
                    catch
                    {
                        // 即使传输实现忽略取消，也观察其最终异常，避免后台任务泄漏诊断。
                        _ = sending.ContinueWith(task => { _ = task.Exception; }, TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously);
                        throw;
                    }
                }
                catch (Exception error)
                {
                    ChatDiagnostics.Failure(logger, error, item.Event, item.CorrelationId);
                    // 广播可能已部分送达，不能盲目重试；断开会话促使客户端重连并重新拉取权威快照。
                    presence.DisconnectAll();
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