using System.Numerics;
using System.Security.Cryptography;
using System.Text;

namespace Meowv.Api.Modules.Music.Providers;

// 网页公开请求协议的原生实现；常量是公开协议参数，不是账号或服务凭据。
internal static class NeteaseWebProtocol
{
    private const string Modulus = "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";

    internal static FormUrlEncodedContent Encode(string json)
    {
        var session = RandomNumberGenerator.GetString("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 16);
        var first = Encrypt(json, "0CoJUm6Qyw8W8jud");
        var second = Encrypt(first, session);
        var number = new BigInteger(Encoding.ASCII.GetBytes(new string(session.Reverse().ToArray())), true, true);
        var modulus = new BigInteger(Convert.FromHexString(Modulus), true, true);
        var encrypted = Convert.ToHexString(BigInteger.ModPow(number, 65537, modulus).ToByteArray(true, true))
            .ToLowerInvariant().PadLeft(256, '0');
        return new FormUrlEncodedContent(new Dictionary<string, string> { ["params"] = second, ["encSecKey"] = encrypted });
    }

    private static string Encrypt(string value, string protocolParameter)
    {
        using var aes = Aes.Create();
        aes.Key = Encoding.ASCII.GetBytes(protocolParameter);
        return Convert.ToBase64String(aes.EncryptCbc(Encoding.UTF8.GetBytes(value), "0102030405060708"u8, PaddingMode.PKCS7));
    }
}
