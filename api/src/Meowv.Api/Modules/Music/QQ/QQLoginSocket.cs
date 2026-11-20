using System.Buffers.Binary;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace Meowv.Api.Modules.Music.QQ;

internal static class QQLoginSocket
{
    private const string Root = "wss://mu.y.qq.com/ws/handshake";
    private const string Agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
    private const int Limit = 64 * 1024;

    public static async Task ListenAsync(string id, Action ready, Func<string, JsonElement, Task<bool>> onEvent, CancellationToken ct)
    {
        var topic = "management.qrcode_login/" + id;
        var endpoint = Root;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            using var socket = new ClientWebSocket();
            socket.Options.AddSubProtocol("mqtt");
            socket.Options.SetRequestHeader("Origin", "https://y.qq.com");
            socket.Options.SetRequestHeader("Referer", "https://y.qq.com/");
            socket.Options.SetRequestHeader("User-Agent", Agent);
            using var connect = CancellationTokenSource.CreateLinkedTokenSource(ct);
            connect.CancelAfter(TimeSpan.FromSeconds(12));
            await socket.ConnectAsync(new Uri(endpoint), connect.Token);
            var reader = new PacketReader(socket);
            var clientId = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(System.Globalization.CultureInfo.InvariantCulture) +
                           Random.Shared.Next(1000, 10000).ToString(System.Globalization.CultureInfo.InvariantCulture);
            await Send(socket, 0x10, Compose(body =>
            {
                Utf8(body, "MQTT");
                body.WriteByte(5);
                body.WriteByte(2);
                Word(body, 45);
                Properties(body, props =>
                {
                    props.WriteByte(0x15);
                    Utf8(props, "pass");
                    User(props, "tmeAppID", "qqmusic");
                    User(props, "business", "management");
                    User(props, "hashTag", id);
                    User(props, "clientTag", "management.user");
                    User(props, "userID", id);
                });
                Utf8(body, clientId);
            }), connect.Token);
            var ack = await reader.ReadAsync(connect.Token);
            if (ack.Header != 0x20) throw QQAccountClient.Unavailable();
            var reply = ParseAck(ack.Body);
            if (reply.Reason is 0x9c or 0x9d && reply.Redirect is { Length: > 0 and <= 160 } node &&
                node.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '-' or '_' or ':'))
            {
                endpoint = Root + "/" + node;
                continue;
            }

            if (reply.Reason != 0) throw QQAccountClient.Unavailable();

            await Send(socket, 0x82, Compose(body =>
            {
                Word(body, 1);
                Properties(body, props =>
                {
                    User(props, "authorization", "tmelogin");
                    User(props, "pubsub", "unicast");
                });
                Utf8(body, topic);
                body.WriteByte(0);
            }), connect.Token);
            var subscribed = await reader.ReadAsync(connect.Token);
            if (subscribed.Header != 0x90 || !Subscribed(subscribed.Body)) throw QQAccountClient.Unavailable();
            ready();

            while (true)
            {
                var next = reader.ReadAsync(ct);
                using (var idle = CancellationTokenSource.CreateLinkedTokenSource(ct))
                {
                    idle.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(reply.KeepAlive / 2, 1, 25)));
                    try
                    {
                        await next.WaitAsync(idle.Token);
                    }
                    catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                    {
                        await Send(socket, 0xc0, [], ct);
                    }
                }

                var packet = await next.WaitAsync(TimeSpan.FromSeconds(45), ct);
                if ((packet.Header >> 4) == 13) continue;
                if ((packet.Header >> 4) != 3) throw QQAccountClient.Unavailable();
                var published = ParsePublish(packet.Header, packet.Body);
                if (published.PacketId != 0)
                    await Send(socket, 0x40, Compose(body => Word(body, published.PacketId)), ct);
                if (published.Topic != topic || published.Event is null) continue;
                using var payload = JsonDocument.Parse(published.Payload.IsEmpty ? "{}"u8.ToArray() : published.Payload);
                if (await onEvent(published.Event, payload.RootElement)) return;
            }
        }

        throw QQAccountClient.Unavailable();
    }

    private static (int Reason, string? Redirect, int KeepAlive) ParseAck(byte[] body)
    {
        var packet = new Cursor(body);
        packet.Byte();
        var reason = packet.Byte();
        var props = new Cursor(packet.Properties());
        string? redirect = null;
        var keepAlive = 45;
        while (props.Remaining > 0)
        {
            var key = props.Variable();
            if (key == 0x1c) redirect = props.Utf8();
            else if (key == 0x13) keepAlive = props.Word();
            else SkipProperty(ref props, key);
        }

        return (reason, redirect, keepAlive);
    }

    private static bool Subscribed(byte[] body)
    {
        var packet = new Cursor(body);
        if (packet.Word() != 1) return false;
        packet.Properties();
        return packet.Remaining == 1 && packet.Byte() == 0;
    }

    private static (string Topic, int PacketId, string? Event, ReadOnlyMemory<byte> Payload) ParsePublish(byte header, byte[] body)
    {
        var packet = new Cursor(body);
        var topic = packet.Utf8();
        var qos = (header >> 1) & 3;
        if (qos > 1) throw QQAccountClient.Unavailable();
        var id = qos == 1 ? packet.Word() : 0;
        var props = new Cursor(packet.Properties());
        string? eventType = null;
        while (props.Remaining > 0)
        {
            var key = props.Variable();
            if (key == 0x26)
            {
                var name = props.Utf8();
                var value = props.Utf8();
                if (name == "type") eventType = value;
            }
            else SkipProperty(ref props, key);
        }

        return (topic, id, eventType, body.AsMemory(body.Length - packet.Remaining));
    }

    private static void SkipProperty(ref Cursor props, int key)
    {
        switch (key)
        {
            case 0x01 or 0x17 or 0x19 or 0x24 or 0x25 or 0x28 or 0x29 or 0x2a: props.Take(1); break;
            case 0x13 or 0x21 or 0x22 or 0x23: props.Take(2); break;
            case 0x02 or 0x11 or 0x18 or 0x27: props.Take(4); break;
            case 0x0b: props.Variable(); break;
            case 0x03 or 0x08 or 0x09 or 0x12 or 0x15 or 0x16 or 0x1a or 0x1c or 0x1f: props.Take(props.Word()); break;
            case 0x26:
                props.Take(props.Word());
                props.Take(props.Word());
                break;
            default: throw QQAccountClient.Unavailable();
        }
    }

    private static byte[] Compose(Action<MemoryStream> write)
    {
        using var value = new MemoryStream();
        write(value);
        return value.ToArray();
    }

    private static Task Send(ClientWebSocket socket, byte header, byte[] payload, CancellationToken ct) =>
        socket.SendAsync(new ArraySegment<byte>(Compose(packet =>
        {
            packet.WriteByte(header);
            Variable(packet, payload.Length);
            packet.Write(payload);
        })), WebSocketMessageType.Binary, true, ct);

    private static void Properties(MemoryStream stream, Action<MemoryStream> write)
    {
        var data = Compose(write);
        Variable(stream, data.Length);
        stream.Write(data);
    }

    private static void User(MemoryStream stream, string name, string value)
    {
        stream.WriteByte(0x26);
        Utf8(stream, name);
        Utf8(stream, value);
    }

    private static void Utf8(MemoryStream stream, string text)
    {
        var data = Encoding.UTF8.GetBytes(text);
        Word(stream, data.Length);
        stream.Write(data);
    }

    private static void Word(MemoryStream stream, int value)
    {
        Span<byte> bytes = stackalloc byte[2];
        BinaryPrimitives.WriteUInt16BigEndian(bytes, checked((ushort)value));
        stream.Write(bytes);
    }

    private static void Variable(MemoryStream stream, int value)
    {
        do
        {
            var digit = value & 127;
            value >>= 7;
            stream.WriteByte((byte)(digit | (value == 0 ? 0 : 128)));
        } while (value != 0);
    }

    private ref struct Cursor(ReadOnlySpan<byte> body)
    {
        private ReadOnlySpan<byte> _remaining = body;
        public int Remaining => _remaining.Length;

        public ReadOnlySpan<byte> Take(int count)
        {
            if (count > _remaining.Length) throw QQAccountClient.Unavailable();
            var value = _remaining[..count];
            _remaining = _remaining[count..];
            return value;
        }

        public byte Byte() => Take(1)[0];
        public int Word() => BinaryPrimitives.ReadUInt16BigEndian(Take(2));
        public string Utf8() => Encoding.UTF8.GetString(Take(Word()));
        public ReadOnlySpan<byte> Properties() => Take(Variable());

        public int Variable()
        {
            var value = 0;
            for (var shift = 0; shift <= 21; shift += 7)
            {
                var digit = Byte();
                value |= (digit & 127) << shift;
                if ((digit & 128) == 0) return value;
            }

            throw QQAccountClient.Unavailable();
        }
    }

    private sealed class PacketReader(ClientWebSocket socket)
    {
        private readonly byte[] _buffer = new byte[Limit];
        private int _length;

        public async Task<(byte Header, byte[] Body)> ReadAsync(CancellationToken ct)
        {
            while (true)
            {
                if (TryRead(out var packet)) return packet;
                if (_length == Limit) throw QQAccountClient.Unavailable();
                var fragment = await socket.ReceiveAsync(_buffer.AsMemory(_length), ct);
                if (fragment.MessageType != WebSocketMessageType.Binary) throw QQAccountClient.Unavailable();
                _length += fragment.Count;
            }
        }

        private bool TryRead(out (byte Header, byte[] Body) packet)
        {
            packet = default;
            var length = 0;
            for (var index = 1; index < Math.Min(_length, 5); index++)
            {
                length |= (_buffer[index] & 127) << ((index - 1) * 7);
                if ((_buffer[index] & 128) != 0) continue;
                var start = index + 1;
                if (length > Limit - start) throw QQAccountClient.Unavailable();
                if (_length < start + length) return false;
                var end = start + length;
                packet = (_buffer[0], _buffer.AsSpan(start, length).ToArray());
                _buffer.AsSpan(end, _length - end).CopyTo(_buffer);
                _length -= end;
                return true;
            }

            return _length >= 5 ? throw QQAccountClient.Unavailable() : false;
        }
    }
}