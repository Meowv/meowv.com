namespace Meowv.Api.Modules.Chat.Application;

public sealed class ChatPresenceService(ChatOptions options)
{
    private sealed record Connection(ChatGuest Guest, DateTimeOffset ExpiresAt, Action Abort);

    private readonly Lock _gate = new();
    private readonly Dictionary<string, Connection> _connections = new();

    public int OnlineUsers
    {
        get
        {
            lock (_gate) return _connections.Values.Where(c => c.ExpiresAt > DateTimeOffset.UtcNow).Select(c => c.Guest.Id).Distinct().Count();
        }
    }

    internal (string Id, Action Abort)[] Connections
    {
        get
        {
            lock (_gate) return [.. _connections.Select(pair => (pair.Key, pair.Value.Abort))];
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

    internal void AbortConnection(string id)
    {
        Action? abort;
        lock (_gate) abort = _connections.Remove(id, out var connection) ? connection.Abort : null;
        abort?.Invoke();
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