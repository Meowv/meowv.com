using System.Security.Cryptography;
using System.Text;

namespace Meowv.Api.Modules.XiaomiCamera.Cloud;

/// <summary>小米云历史 RC4 请求签名。仅用于兼容私有 API，不得复用为新的通用加密方案。</summary>
public static class XiaomiCloudRequestSigner
{
    public static IReadOnlyList<KeyValuePair<string, string>> CreateForm(string path, string json, byte[] ssecurity, byte[] nonce)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        ArgumentException.ThrowIfNullOrWhiteSpace(json);
        ArgumentNullException.ThrowIfNull(ssecurity);
        ArgumentNullException.ThrowIfNull(nonce);

        var signedNonce = SHA256.HashData(Join(ssecurity, nonce));
        var form = new List<KeyValuePair<string, string>>
        {
            new("data", json),
        };
        var hash = Signature(path, form, signedNonce);
        form.Add(new KeyValuePair<string, string>("rc4_hash__", hash));

        for (var index = 0; index < form.Count; index++)
        {
            var pair = form[index];
            form[index] = new KeyValuePair<string, string>(
                pair.Key,
                Convert.ToBase64String(Rc4Drop1024.Transform(signedNonce, Encoding.UTF8.GetBytes(pair.Value))));
        }

        form.Add(new KeyValuePair<string, string>("signature", Signature(path, form, signedNonce)));
        form.Add(new KeyValuePair<string, string>("_nonce", Convert.ToBase64String(nonce)));
        return form;
    }

    public static byte[] CreateNonce(DateTimeOffset now)
    {
        var nonce = new byte[12];
        RandomNumberGenerator.Fill(nonce.AsSpan(0, 8));
        var minutes = checked((uint)(now.ToUnixTimeSeconds() / 60));
        nonce[8] = (byte)(minutes >> 24);
        nonce[9] = (byte)(minutes >> 16);
        nonce[10] = (byte)(minutes >> 8);
        nonce[11] = (byte)minutes;
        return nonce;
    }

    public static byte[] DecryptResponse(byte[] response, byte[] ssecurity, byte[] nonce)
    {
        ArgumentNullException.ThrowIfNull(response);
        var signedNonce = SHA256.HashData(Join(ssecurity, nonce));
        return Rc4Drop1024.Transform(signedNonce, Convert.FromBase64String(Encoding.UTF8.GetString(response)));
    }

    private static string Signature(string path, IReadOnlyList<KeyValuePair<string, string>> values, byte[] signedNonce)
    {
        var content = new StringBuilder("POST&").Append(path).Append('&');
        foreach (var pair in values)
        {
            if (pair.Key is "data" or "rc4_hash__")
            {
                content.Append(pair.Key).Append('=').Append(pair.Value).Append('&');
            }
        }

        content.Append(Convert.ToBase64String(signedNonce));
        return Convert.ToBase64String(SHA1.HashData(Encoding.UTF8.GetBytes(content.ToString())));
    }

    private static byte[] Join(byte[] first, byte[] second)
    {
        var value = new byte[first.Length + second.Length];
        Buffer.BlockCopy(first, 0, value, 0, first.Length);
        Buffer.BlockCopy(second, 0, value, first.Length, second.Length);
        return value;
    }
}

internal static class Rc4Drop1024
{
    public static byte[] Transform(byte[] key, byte[] input)
    {
        ArgumentNullException.ThrowIfNull(key);
        ArgumentNullException.ThrowIfNull(input);
        if (key.Length == 0)
        {
            throw new ArgumentException("RC4 密钥不能为空。", nameof(key));
        }

        Span<byte> state = stackalloc byte[256];
        for (var index = 0; index < state.Length; index++)
        {
            state[index] = (byte)index;
        }

        var j = 0;
        for (var index = 0; index < state.Length; index++)
        {
            j = (j + state[index] + key[index % key.Length]) & 0xff;
            (state[index], state[j]) = (state[j], state[index]);
        }

        var i = 0;
        j = 0;
        for (var discarded = 0; discarded < 1024; discarded++)
        {
            i = (i + 1) & 0xff;
            j = (j + state[i]) & 0xff;
            (state[i], state[j]) = (state[j], state[i]);
            _ = state[(state[i] + state[j]) & 0xff];
        }

        var output = new byte[input.Length];
        for (var index = 0; index < input.Length; index++)
        {
            i = (i + 1) & 0xff;
            j = (j + state[i]) & 0xff;
            (state[i], state[j]) = (state[j], state[i]);
            output[index] = (byte)(input[index] ^ state[(state[i] + state[j]) & 0xff]);
        }

        return output;
    }
}