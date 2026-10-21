using System.Buffers.Binary;
using System.Runtime.InteropServices;

namespace Meowv.Api.Modules.XiaomiCamera.Protocol;

/// <summary>DRW 可靠有序分片的最小重组器，输出带 32 位长度前缀的应用消息。</summary>
public sealed class Cs2DataChannel
{
    private const int MaximumMessageLength = 1024 * 1024;
    private const int MaximumPendingFragments = 256;
    private readonly Dictionary<ushort, byte[]> _pending = [];
    private readonly List<byte> _stream = [];
    private readonly Queue<byte[]> _messages = [];
    private ushort _expectedSequence;

    /// <summary>只有已处理或成功缓存的分片才能被确认；窗口满时等待发送端重传。</summary>
    public bool Push(ushort sequence, ReadOnlySpan<byte> data)
    {
        if (IsBefore(sequence, _expectedSequence))
        {
            return true;
        }

        if (sequence != _expectedSequence)
        {
            if (_pending.ContainsKey(sequence)) return true;
            if (_pending.Count >= MaximumPendingFragments) return false;
            _pending.Add(sequence, data.ToArray());
            return true;
        }

        Append(data);
        _expectedSequence++;
        while (_pending.Remove(_expectedSequence, out var next))
        {
            Append(next);
            _expectedSequence++;
        }

        ExtractMessages();
        return true;
    }

    public bool TryRead(out byte[]? message) => _messages.TryDequeue(out message);

    private static bool IsBefore(ushort value, ushort expected) => value != expected && (ushort)(expected - value) < 0x8000;

    private void Append(ReadOnlySpan<byte> data)
    {
        if (data.Length <= 0) return;

        _stream.EnsureCapacity(_stream.Count + data.Length);
        foreach (var value in data)
        {
            _stream.Add(value);
        }
    }

    private void ExtractMessages()
    {
        while (_stream.Count >= sizeof(int))
        {
            var length = BinaryPrimitives.ReadInt32BigEndian(CollectionsMarshal.AsSpan(_stream));
            if (length is < 0 or > MaximumMessageLength)
            {
                throw new Cs2ProtocolException("CS2 DRW 消息长度无效。");
            }

            if (_stream.Count < sizeof(int) + length)
            {
                return;
            }

            _messages.Enqueue(_stream.GetRange(sizeof(int), length).ToArray());
            _stream.RemoveRange(0, sizeof(int) + length);
        }
    }
}

public sealed class Cs2ProtocolException(string message) : Exception(message);