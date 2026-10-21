using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Runtime.InteropServices;

namespace Meowv.Api.Modules.XiaomiCamera.Protocol;

/// <summary>MISS 使用的 NaCl precomputation 与原始 ChaCha20 帧加解密。</summary>
public static class Cs2MissCrypto
{
    private const int KeyLength = 32;
    private const int NonceTailLength = 8;

    public static byte[] DeriveSessionKey(Cs2KeyPair keyPair, string devicePublicKey)
    {
        ArgumentNullException.ThrowIfNull(keyPair);
        var sharedSecret = keyPair.Agree(devicePublicKey);
        try
        {
            return Hsalsa20(sharedSecret, new byte[16]);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(sharedSecret);
        }
    }

    public static byte[] Encrypt(byte[] key, ReadOnlySpan<byte> plaintext)
    {
        ValidateKey(key);
        var result = new byte[NonceTailLength + plaintext.Length];
        RandomNumberGenerator.Fill(result.AsSpan(0, NonceTailLength));
        ApplyChaCha20(key, CreateNonce(result), plaintext, result.AsSpan(NonceTailLength));
        return result;
    }

    public static byte[] Decrypt(byte[] key, ReadOnlySpan<byte> payload)
    {
        ValidateKey(key);
        if (payload.Length < NonceTailLength)
        {
            throw new Cs2ProtocolException("MISS 密文未包含 nonce。");
        }

        var result = new byte[payload.Length - NonceTailLength];
        ApplyChaCha20(key, CreateNonce(payload), payload[NonceTailLength..], result);
        return result;
    }

    private static byte[] Hsalsa20(ReadOnlySpan<byte> key, ReadOnlySpan<byte> input)
    {
        if (key.Length != KeyLength || input.Length != 16)
        {
            throw new Cs2ProtocolException("HSalsa20 输入长度无效。");
        }

        uint x0 = 0x61707865;
        uint x1 = BinaryPrimitives.ReadUInt32LittleEndian(key);
        uint x2 = BinaryPrimitives.ReadUInt32LittleEndian(key[4..]);
        uint x3 = BinaryPrimitives.ReadUInt32LittleEndian(key[8..]);
        uint x4 = BinaryPrimitives.ReadUInt32LittleEndian(key[12..]);
        uint x5 = 0x3320646e;
        uint x6 = BinaryPrimitives.ReadUInt32LittleEndian(input);
        uint x7 = BinaryPrimitives.ReadUInt32LittleEndian(input[4..]);
        uint x8 = BinaryPrimitives.ReadUInt32LittleEndian(input[8..]);
        uint x9 = BinaryPrimitives.ReadUInt32LittleEndian(input[12..]);
        uint x10 = 0x79622d32;
        uint x11 = BinaryPrimitives.ReadUInt32LittleEndian(key[16..]);
        uint x12 = BinaryPrimitives.ReadUInt32LittleEndian(key[20..]);
        uint x13 = BinaryPrimitives.ReadUInt32LittleEndian(key[24..]);
        uint x14 = BinaryPrimitives.ReadUInt32LittleEndian(key[28..]);
        uint x15 = 0x6b206574;

        for (var round = 0; round < 20; round += 2)
        {
            x4 ^= RotateLeft(x0 + x12, 7);
            x8 ^= RotateLeft(x4 + x0, 9);
            x12 ^= RotateLeft(x8 + x4, 13);
            x0 ^= RotateLeft(x12 + x8, 18);
            x9 ^= RotateLeft(x5 + x1, 7);
            x13 ^= RotateLeft(x9 + x5, 9);
            x1 ^= RotateLeft(x13 + x9, 13);
            x5 ^= RotateLeft(x1 + x13, 18);
            x14 ^= RotateLeft(x10 + x6, 7);
            x2 ^= RotateLeft(x14 + x10, 9);
            x6 ^= RotateLeft(x2 + x14, 13);
            x10 ^= RotateLeft(x6 + x2, 18);
            x3 ^= RotateLeft(x15 + x11, 7);
            x7 ^= RotateLeft(x3 + x15, 9);
            x11 ^= RotateLeft(x7 + x3, 13);
            x15 ^= RotateLeft(x11 + x7, 18);
            x1 ^= RotateLeft(x0 + x3, 7);
            x2 ^= RotateLeft(x1 + x0, 9);
            x3 ^= RotateLeft(x2 + x1, 13);
            x0 ^= RotateLeft(x3 + x2, 18);
            x6 ^= RotateLeft(x5 + x4, 7);
            x7 ^= RotateLeft(x6 + x5, 9);
            x4 ^= RotateLeft(x7 + x6, 13);
            x5 ^= RotateLeft(x4 + x7, 18);
            x11 ^= RotateLeft(x10 + x9, 7);
            x8 ^= RotateLeft(x11 + x10, 9);
            x9 ^= RotateLeft(x8 + x11, 13);
            x10 ^= RotateLeft(x9 + x8, 18);
            x12 ^= RotateLeft(x15 + x14, 7);
            x13 ^= RotateLeft(x12 + x15, 9);
            x14 ^= RotateLeft(x13 + x12, 13);
            x15 ^= RotateLeft(x14 + x13, 18);
        }

        var output = new byte[KeyLength];
        BinaryPrimitives.WriteUInt32LittleEndian(output, x0);
        BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(4), x5);
        BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(8), x10);
        BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(12), x15);
        BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(16), x6);
        BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(20), x7);
        BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(24), x8);
        BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(28), x9);
        return output;
    }

    private static void ApplyChaCha20(ReadOnlySpan<byte> key, ReadOnlySpan<byte> nonce, ReadOnlySpan<byte> input, Span<byte> output)
    {
        var counter = 0u;
        Span<byte> block = stackalloc byte[64];
        for (var offset = 0; offset < input.Length; offset += block.Length)
        {
            ChaCha20Block(key, counter++, nonce, block);
            var count = Math.Min(block.Length, input.Length - offset);
            for (var index = 0; index < count; index++)
            {
                output[offset + index] = (byte)(input[offset + index] ^ block[index]);
            }
        }

        CryptographicOperations.ZeroMemory(block);
    }

    private static void ChaCha20Block(ReadOnlySpan<byte> key, uint counter, ReadOnlySpan<byte> nonce, Span<byte> output)
    {
        if (nonce.Length != 12 || output.Length < 64)
        {
            throw new Cs2ProtocolException("ChaCha20 nonce 或输出长度无效。");
        }

        Span<uint> state =
        [
            0x61707865, 0x3320646e, 0x79622d32, 0x6b206574,
            BinaryPrimitives.ReadUInt32LittleEndian(key), BinaryPrimitives.ReadUInt32LittleEndian(key[4..]),
            BinaryPrimitives.ReadUInt32LittleEndian(key[8..]), BinaryPrimitives.ReadUInt32LittleEndian(key[12..]),
            BinaryPrimitives.ReadUInt32LittleEndian(key[16..]), BinaryPrimitives.ReadUInt32LittleEndian(key[20..]),
            BinaryPrimitives.ReadUInt32LittleEndian(key[24..]), BinaryPrimitives.ReadUInt32LittleEndian(key[28..]),
            counter, BinaryPrimitives.ReadUInt32LittleEndian(nonce), BinaryPrimitives.ReadUInt32LittleEndian(nonce[4..]),
            BinaryPrimitives.ReadUInt32LittleEndian(nonce[8..])
        ];
        Span<uint> working = stackalloc uint[16];
        state.CopyTo(working);
        for (var round = 0; round < 10; round++)
        {
            QuarterRound(ref working[0], ref working[4], ref working[8], ref working[12]);
            QuarterRound(ref working[1], ref working[5], ref working[9], ref working[13]);
            QuarterRound(ref working[2], ref working[6], ref working[10], ref working[14]);
            QuarterRound(ref working[3], ref working[7], ref working[11], ref working[15]);
            QuarterRound(ref working[0], ref working[5], ref working[10], ref working[15]);
            QuarterRound(ref working[1], ref working[6], ref working[11], ref working[12]);
            QuarterRound(ref working[2], ref working[7], ref working[8], ref working[13]);
            QuarterRound(ref working[3], ref working[4], ref working[9], ref working[14]);
        }

        for (var index = 0; index < working.Length; index++)
        {
            BinaryPrimitives.WriteUInt32LittleEndian(output[(index * 4)..], working[index] + state[index]);
        }

        CryptographicOperations.ZeroMemory(MemoryMarshal.AsBytes(state));
        CryptographicOperations.ZeroMemory(MemoryMarshal.AsBytes(working));
    }

    private static byte[] CreateNonce(ReadOnlySpan<byte> source)
    {
        var nonce = new byte[12];
        source[..NonceTailLength].CopyTo(nonce.AsSpan(4));
        return nonce;
    }

    private static void QuarterRound(ref uint a, ref uint b, ref uint c, ref uint d)
    {
        a += b;
        d = RotateLeft(d ^ a, 16);
        c += d;
        b = RotateLeft(b ^ c, 12);
        a += b;
        d = RotateLeft(d ^ a, 8);
        c += d;
        b = RotateLeft(b ^ c, 7);
    }

    private static uint RotateLeft(uint value, int count) => (value << count) | (value >> (32 - count));

    private static void ValidateKey(byte[] key)
    {
        ArgumentNullException.ThrowIfNull(key);
        if (key.Length != KeyLength)
        {
            throw new Cs2ProtocolException("MISS 会话密钥长度无效。");
        }
    }
}