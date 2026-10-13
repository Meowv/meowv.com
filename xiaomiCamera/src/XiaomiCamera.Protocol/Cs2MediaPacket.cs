using System.Buffers.Binary;

namespace XiaomiCamera.Protocol;

/// <summary>一个已验证的 MISS 媒体帧；载荷只在调用期间驻留内存。</summary>
public sealed record Cs2MediaPacket(int CodecId, uint Sequence, uint Flags, long TimestampMilliseconds, byte[] Payload)
{
    public const int HeaderLength = 32;
    public bool IsKeyFrame => (Flags & 1) != 0;
    public bool IsVideo => CodecId is 4 or 5;
    public bool IsAudio => CodecId is 1024 or 1026 or 1027 or 1032;
    public int AudioSampleRate => ((Flags >> 3) & 15) == 0 ? 8000 : 16000;

    public string CodecName => CodecId switch
    {
        4 => "H264",
        5 => "H265",
        1027 => "PCMA",
        1032 => "OPUS",
        1026 => "PCMU",
        1024 => "PCM",
        _ => $"codec-{CodecId}",
    };

    public static Cs2MediaPacket Parse(ReadOnlySpan<byte> message, byte[] sessionKey)
    {
        if (message.Length < HeaderLength)
        {
            throw new Cs2ProtocolException("MISS 媒体消息短于固定头。");
        }

        var ciphertextLength = BinaryPrimitives.ReadUInt32LittleEndian(message);
        if (ciphertextLength != message.Length - HeaderLength)
        {
            throw new Cs2ProtocolException("MISS 媒体消息长度不一致。");
        }

        return new Cs2MediaPacket(
            BinaryPrimitives.ReadInt32LittleEndian(message[4..]),
            BinaryPrimitives.ReadUInt32LittleEndian(message[8..]),
            BinaryPrimitives.ReadUInt32LittleEndian(message[12..]),
            BinaryPrimitives.ReadInt64LittleEndian(message[16..]),
            Cs2MissCrypto.Decrypt(sessionKey, message[HeaderLength..]));
    }
}