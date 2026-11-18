using System.Buffers.Binary;
using System.Security.Cryptography;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>将摄像机的 Opus 访问单元封装为 FFmpeg 可读取的 Ogg Opus 流。</summary>
internal sealed class OggOpusWriter(Stream output)
{
    private readonly uint _serial = BitConverter.ToUInt32(RandomNumberGenerator.GetBytes(4));
    private uint _sequence;
    private long _granulePosition;

    public async Task WriteHeadersAsync(CancellationToken cancellationToken)
    {
        var head = new byte[19];
        "OpusHead"u8.CopyTo(head);
        head[8] = 1;
        head[9] = 1;
        BinaryPrimitives.WriteUInt32LittleEndian(head.AsSpan(12), 48000);
        await WritePageAsync(head, 2, 0, cancellationToken);

        var tags = new byte[22];
        "OpusTags"u8.CopyTo(tags);
        BinaryPrimitives.WriteUInt32LittleEndian(tags.AsSpan(8), 6);
        "Xiaomi"u8.CopyTo(tags.AsSpan(12));
        await WritePageAsync(tags, 0, 0, cancellationToken);
    }

    public async Task WritePacketAsync(byte[] packet, CancellationToken cancellationToken)
    {
        if (packet.Length == 0) return;
        _granulePosition += PacketSamples(packet);
        await WritePageAsync(packet, 0, _granulePosition, cancellationToken);
    }

    private async Task WritePageAsync(byte[] packet, byte headerType, long position, CancellationToken cancellationToken)
    {
        var segments = packet.Length / 255 + 1;
        if (segments > 255) throw new XiaomiPlaybackException("Opus 音频帧过长。", false);
        var page = new byte[27 + segments + packet.Length];
        "OggS"u8.CopyTo(page);
        page[4] = 0;
        page[5] = headerType;
        BinaryPrimitives.WriteInt64LittleEndian(page.AsSpan(6), position);
        BinaryPrimitives.WriteUInt32LittleEndian(page.AsSpan(14), _serial);
        BinaryPrimitives.WriteUInt32LittleEndian(page.AsSpan(18), _sequence++);
        page[26] = (byte)segments;
        for (var index = 0; index < segments; index++)
        {
            page[27 + index] = (byte)Math.Min(255, packet.Length - index * 255);
        }

        packet.AsSpan().CopyTo(page.AsSpan(27 + segments));
        var checksum = 0u;
        foreach (var value in page)
        {
            checksum ^= (uint)value << 24;
            for (var bit = 0; bit < 8; bit++)
            {
                checksum = (checksum << 1) ^ ((checksum & 0x80000000) != 0 ? 0x04C11DB7u : 0u);
            }
        }

        BinaryPrimitives.WriteUInt32LittleEndian(page.AsSpan(22), checksum);
        try
        {
            await output.WriteAsync(page, cancellationToken);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(page);
        }
    }

    private static int PacketSamples(ReadOnlySpan<byte> packet)
    {
        var config = packet[0] >> 3;
        var frameSamples = config < 12
            ? (config % 4) switch { 0 => 480, 1 => 960, 2 => 1920, _ => 2880 }
            : config < 16
                ? (config % 2 == 0 ? 480 : 960)
                : (config % 4) switch { 0 => 120, 1 => 240, 2 => 480, _ => 960 };
        var count = (packet[0] & 3) switch
        {
            0 => 1,
            1 or 2 => 2,
            _ => packet.Length > 1 ? packet[1] & 63 : 0,
        };
        var samples = frameSamples * count;
        return samples is > 0 and <= 5760 ? samples : throw new XiaomiPlaybackException("Opus 帧时长无效。", false);
    }
}