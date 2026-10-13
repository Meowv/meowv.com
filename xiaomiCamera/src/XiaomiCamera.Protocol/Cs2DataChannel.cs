using System.Buffers.Binary;
using System.Runtime.InteropServices;

namespace XiaomiCamera.Protocol;

/// <summary>DRW 可靠有序分片的最小重组器，输出带 32 位长度前缀的应用消息。</summary>
public sealed class Cs2DataChannel
{
    private const int MaximumMessageLength = 1024 * 1024;
    private const int MaximumPendingFragments = 256;
    private readonly Dictionary<ushort, byte[]> pending = [];
    private readonly List<byte> stream = [];
    private readonly Queue<byte[]> messages = [];
    private ushort expectedSequence;

    /// <summary>只有已处理或成功缓存的分片才能被确认；窗口满时等待发送端重传。</summary>
    public bool Push(ushort sequence, ReadOnlySpan<byte> data)
    {
        if (IsBefore(sequence, expectedSequence))
        {
            return true;
        }

        if (sequence != expectedSequence)
        {
            if (pending.ContainsKey(sequence)) return true;
            if (pending.Count >= MaximumPendingFragments) return false;
            pending.Add(sequence, data.ToArray());
            return true;
        }

        Append(data);
        expectedSequence++;
        while (pending.Remove(expectedSequence, out var next))
        {
            Append(next);
            expectedSequence++;
        }

        ExtractMessages();
        return true;
    }

    public bool TryRead(out byte[]? message) => messages.TryDequeue(out message);

    private static bool IsBefore(ushort value, ushort expected) => value != expected && (ushort)(expected - value) < 0x8000;

    private void Append(ReadOnlySpan<byte> data)
    {
        if (data.Length <= 0) return;

        stream.EnsureCapacity(stream.Count + data.Length);
        foreach (var value in data)
        {
            stream.Add(value);
        }
    }

    private void ExtractMessages()
    {
        while (stream.Count >= sizeof(int))
        {
            var length = BinaryPrimitives.ReadInt32BigEndian(CollectionsMarshal.AsSpan(stream));
            if (length is < 0 or > MaximumMessageLength)
            {
                throw new Cs2ProtocolException("CS2 DRW 消息长度无效。");
            }

            if (stream.Count < sizeof(int) + length)
            {
                return;
            }

            messages.Enqueue(stream.GetRange(sizeof(int), length).ToArray());
            stream.RemoveRange(0, sizeof(int) + length);
        }
    }
}

public sealed class Cs2ProtocolException(string message) : Exception(message);