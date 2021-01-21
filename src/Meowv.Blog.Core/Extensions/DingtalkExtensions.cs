using System;
using System.Security.Cryptography;

namespace Meowv.Blog.Extensions
{
    public static class DingtalkExtensions
    {
        public static string Sign(this string timestamp, string appSecret)
        {
            return HmacSHA256(timestamp, appSecret);
        }

        private static string HmacSHA256(string str, string key)
        {
            var keyBytes = key.GetBytes();
            var strBytes = str.GetBytes();

            using var hmacsha256 = new HMACSHA256(keyBytes);

            var hashmessage = hmacsha256.ComputeHash(strBytes);
            return Convert.ToBase64String(hashmessage);
        }
    }
}