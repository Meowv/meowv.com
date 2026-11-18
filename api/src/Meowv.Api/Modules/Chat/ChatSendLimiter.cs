namespace Meowv.Api.Modules.Chat;

public sealed class ChatSendLimiter(ChatOptions options)
{
    private sealed class Window
    {
        public readonly DateTimeOffset Start = DateTimeOffset.UtcNow;
        public DateTimeOffset Last;
        public int Count;
    }

    private readonly Dictionary<string, Window> _windows = new();

    public void Check(string guestId, string ip)
    {
        var now = DateTimeOffset.UtcNow;
        // 发送入口由 ChatService 串行调用；过期 IP、会话计数及时释放。
        foreach (var key in _windows.Where(pair => now - pair.Value.Start >= TimeSpan.FromMinutes(1)).Select(pair => pair.Key).ToArray()) _windows.Remove(key);
        var guest = Get("guest:" + guestId);
        var address = Get("ip:" + ip);
        if (now - guest.Last < TimeSpan.FromMilliseconds(options.SendCooldownMs) || guest.Count >= options.MessagesPerMinute || address.Count >= options.IpMessagesPerMinute)
            throw new ChatException("rate_limited", "发送太快，请稍后再试。", 429);
        guest.Count++;
        guest.Last = now;
        address.Count++;
    }

    private Window Get(string key)
    {
        if (!_windows.TryGetValue(key, out var window)) _windows.Add(key, window = new Window());
        return window;
    }
}