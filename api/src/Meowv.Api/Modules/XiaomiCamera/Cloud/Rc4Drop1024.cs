namespace Meowv.Api.Modules.XiaomiCamera.Cloud;

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