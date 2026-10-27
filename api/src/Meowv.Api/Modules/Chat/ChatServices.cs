using System.Security.Cryptography;
using System.Security.Claims;

namespace Meowv.Api.Modules.Chat;

public sealed class ChatSessionService(ChatRepository repository)
{
    public const string CookieName = "meowv_chat_session";
    internal static string Hash(string token) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token)));

    internal ChatSession? Current(HttpContext context)
    {
        var token = context.Request.Cookies[CookieName];
        return token is { Length: 64 } ? repository.FindSession(Hash(token)) : null;
    }

    internal ChatSession Require(ClaimsPrincipal principal)
    {
        var hash = principal.FindFirst("chat_hash")?.Value;
        var session = hash is null ? null : repository.FindSession(hash);
        return session is not { Active: true } ? throw new ChatException("session_expired", "会话已失效，请重新加入。", 401) : session;
    }

    internal ChatSession Create(HttpContext context, string nickname)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var session = repository.CreateSession(Hash(token), nickname);
        context.Response.Cookies.Append(CookieName, token, CookieOptions(context, session.ExpiresAt));
        return session;
    }

    internal void Logout(HttpContext context, ChatPresenceService presence)
    {
        var session = Current(context);
        if (session is not null)
        {
            repository.Revoke(session.TokenHash);
            presence.Disconnect(session.Guest.Id);
        }

        context.Response.Cookies.Delete(CookieName, CookieOptions(context, null));
    }

    private static CookieOptions CookieOptions(HttpContext context, DateTimeOffset? expires) => new()
    {
        HttpOnly = true, Secure = !context.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment() || context.Request.IsHttps,
        SameSite = SameSiteMode.Strict, Path = "/api/chat", Expires = expires,
        MaxAge = expires.HasValue ? expires.Value - DateTimeOffset.UtcNow : null, IsEssential = true,
    };
}

public sealed class ChatPresenceService(ChatOptions options)
{
    private sealed record Connection(ChatGuest Guest, DateTimeOffset ExpiresAt, Action Abort);

    private readonly Lock _gate = new();
    private readonly Dictionary<string, Connection> _connections = new();

    public int OnlineUsers
    {
        get
        {
            lock (_gate) return _connections.Values.Select(c => c.Guest.Id).Distinct().Count();
        }
    }

    public ChatGuest[] OnlineGuests
    {
        get
        {
            lock (_gate) return _connections.Values.Where(c => c.ExpiresAt > DateTimeOffset.UtcNow).Select(c => c.Guest).DistinctBy(guest => guest.Id).ToArray();
        }
    }

    internal void Add(string id, ChatSession session, Action abort)
    {
        lock (_gate)
        {
            if (_connections.Count >= options.MaxConnections || _connections.Values.Count(c => c.Guest.Id == session.Guest.Id) >= options.MaxConnectionsPerGuest)
                throw new ChatException("connection_limit", "连接数已达上限，请关闭多余标签页后重试。", 429);
            _connections.Add(id, new Connection(session.Guest, session.ExpiresAt, abort));
        }
    }

    public void Remove(string id)
    {
        lock (_gate) _connections.Remove(id);
    }

    public void Disconnect(string guestId)
    {
        Action[] actions;
        lock (_gate)
        {
            var ids = _connections.Where(pair => pair.Value.Guest.Id == guestId).Select(pair => pair.Key).ToArray();
            actions = [.. ids.Select(id => _connections[id].Abort)];
            foreach (var id in ids) _connections.Remove(id);
        }

        foreach (var action in actions) action();
    }

    internal void DisconnectAll()
    {
        string[] guests;
        lock (_gate) guests = [.. _connections.Values.Select(connection => connection.Guest.Id).Distinct()];
        foreach (var guest in guests) Disconnect(guest);
    }

    public void Expire()
    {
        string[] guests;
        lock (_gate) guests = [.. _connections.Values.Where(c => c.ExpiresAt <= DateTimeOffset.UtcNow).Select(c => c.Guest.Id).Distinct()];
        foreach (var guest in guests) Disconnect(guest);
    }
}

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

public sealed class ChatService(ChatSessionService sessions, ChatRepository repository, ChatOptions options, ChatSendLimiter limiter, ChatPresenceService presence, ChatBroadcastQueue broadcasts, ILogger<ChatService> logger)
{
    // 只串行落库与入队；网络发送不能占用业务锁，事件按提交顺序消费。
    internal SemaphoreSlim Gate { get; } = new(1, 1);

    private ChatMention[] ResolveMentions(string senderId, string content, ChatMentionRequest[]? requests)
    {
        if (requests is null || requests.Length == 0) return [];
        if (requests.Length > 10) throw new ChatException("invalid_mention", "每条消息最多提及 10 次。");
        var online = presence.OnlineGuests.ToDictionary(guest => guest.Id);
        var mentions = new List<ChatMention>();
        var end = 0;
        foreach (var request in requests.OrderBy(request => request.Start))
        {
            if (!Guid.TryParseExact(request.GuestId, "D", out var parsed)) throw new ChatException("invalid_mention", "提及的访客无效。");
            var guestId = parsed.ToString();
            if (guestId == senderId) throw new ChatException("invalid_mention", "不能提及自己。");
            var guest = online.GetValueOrDefault(guestId) ?? repository.PublicGuest(guestId);
            if (guest is null) throw new ChatException("invalid_mention", "提及的访客已不可用，请重新选择。");
            var token = "@" + guest.Nickname;
            if (request.Start < end || request.Start < 0 || request.Length != token.Length || request.Start > content.Length - request.Length || !content.AsSpan(request.Start, request.Length).SequenceEqual(token.AsSpan()))
                throw new ChatException("invalid_mention", "提及内容已改变，请重新选择访客。");
            mentions.Add(new ChatMention(guest.Id, guest.Nickname, request.Start, request.Length));
            end = request.Start + request.Length;
        }

        return [.. mentions];
    }

    internal async Task<ChatAck> SendAsync(ClaimsPrincipal user, string ip, string clientMessageId, string content, string? replyToId = null, ChatMentionRequest[]? mentions = null, CancellationToken cancellationToken = default)
    {
        await Gate.WaitAsync(cancellationToken);
        try
        {
            var session = sessions.Require(user);
            if (!Guid.TryParseExact(clientMessageId, "D", out var parsed)) throw new ChatException("invalid_message_id", "消息标识无效。");
            var id = parsed.ToString();
            var duplicate = repository.FindDuplicate(session.Guest.Id, id);
            if (duplicate is not null) return new ChatAck(duplicate.Id, duplicate.ClientMessageId, duplicate.CreatedAt, duplicate.Reply, duplicate.Mentions ?? []);
            var validated = ChatValidation.Content(content, options);
            if (replyToId is not null)
            {
                if (!long.TryParse(replyToId, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var replyId) || replyId < 1)
                    throw new ChatException("invalid_reply", "引用消息无效。");
                replyToId = replyId.ToString(System.Globalization.CultureInfo.InvariantCulture);
                var original = repository.Message(replyToId);
                if (original is null || original.Deleted || (options.MessageCleanupEnabled && original.CreatedAt < DateTimeOffset.UtcNow.AddDays(-options.RetentionDays)))
                    throw new ChatException("invalid_reply", "原消息已被移除或不可用，请取消引用后重试。");
            }

            var resolvedMentions = ResolveMentions(session.Guest.Id, validated, mentions);
            using var reservation = broadcasts.Reserve();
            cancellationToken.ThrowIfCancellationRequested();
            limiter.Check(session.Guest.Id, ip);
            var message = repository.Insert(session, id, validated, replyToId, resolvedMentions);
            reservation.Publish("message.created", message);

            return new ChatAck(message.Id, message.ClientMessageId, message.CreatedAt, message.Reply, message.Mentions ?? []);
        }
        catch (Exception error) when (error is not ChatException and not OperationCanceledException)
        {
            ChatDiagnostics.Failure(logger, error, "save", ChatDiagnostics.CorrelationId);
            throw;
        }
        finally
        {
            Gate.Release();
        }
    }
}