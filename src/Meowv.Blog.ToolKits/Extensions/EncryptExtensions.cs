using System;
using System.Security.Cryptography;
using System.Text;

namespace Meowv.Blog.ToolKits.Extensions
{
    public static class EncryptExtensions
    {
        #region Base64

        /// <summary>
        /// 将字符串使用base64算法编码 
        /// </summary>
        /// <param name="encodingName">编码类型（编码名称）</param>
        /// <param name="inputStr">待加密的字符串</param>
        /// <returns>加密后的字符串</returns> 
        public static string EncodeBase64String(this string inputStr, string encodingName = "UTF-8")
        {
            if (inputStr.IsNull())
                return null;

            var bytes = Encoding.GetEncoding(encodingName).GetBytes(inputStr);
            return Convert.ToBase64String(bytes);
        }

        /// <summary> 
        /// 将字符串使用base64算法解码
        /// </summary> 
        /// <param name="encodingName">编码类型</param> 
        /// <param name="base64String">已用base64算法加密的字符串</param> 
        /// <returns>解密后的字符串</returns> 
        public static string DecodeBase64String(this string base64String, string encodingName = "UTF-8")
        {
            if (base64String.IsNull())
                return null;

            var bytes = Convert.FromBase64String(base64String);
            return Encoding.GetEncoding(encodingName).GetString(bytes);
        }

        #endregion

        #region Md5

        /// <summary>
        /// 将字符串使用MD5算法加密
        /// </summary>
        /// <param name="inputStr"></param>
        /// <returns></returns>
        public static string EncodeMd5String(this string inputStr)
        {
            if (inputStr.IsNullOrEmpty())
                return inputStr;

            using var md5 = MD5.Create();
            var result = md5.ComputeHash(Encoding.Default.GetBytes(inputStr));
            return BitConverter.ToString(result).Replace("-", "");
        }

        #endregion

        #region SHA

        /// <summary>
        /// 将字符串使用SHA1算法加密
        /// </summary>
        /// <param name="inputStr">明文</param>
        /// <returns></returns>
        public static string EncodeSha1String(this string inputStr)
        {
            if (inputStr.IsNull())
                return null;

            using var sha1 = SHA1.Create();
            var buffer = Encoding.UTF8.GetBytes(inputStr);
            var byteArr = sha1.ComputeHash(buffer);
            return BitConverter.ToString(byteArr).Replace("-", "").ToLower();
        }

        /// <summary>
        /// 将字符串使用SHA256算法加密
        /// </summary>
        /// <param name="inputStr">明文</param>
        /// <returns></returns>
        public static string EncodeSha256String(this string inputStr)
        {
            if (inputStr.IsNull())
                return null;

            using var sha256 = SHA256.Create();
            var buffer = Encoding.UTF8.GetBytes(inputStr);
            var byteArr = sha256.ComputeHash(buffer);
            return BitConverter.ToString(byteArr).Replace("-", "").ToLower();
        }

        /// <summary>
        /// 将字符串使用SHA384算法加密
        /// </summary>
        /// <param name="inputStr">明文</param>
        /// <returns></returns>
        public static string EncodeSha384String(this string inputStr)
        {
            if (inputStr.IsNull())
                return null;

            using var sha384 = SHA384.Create();
            var buffer = Encoding.UTF8.GetBytes(inputStr);
            var byteArr = sha384.ComputeHash(buffer);
            return BitConverter.ToString(byteArr).Replace("-", "").ToLower();
        }

        /// <summary>
        /// 将字符串使用SHA512算法加密
        /// </summary>
        /// <param name="inputStr">明文</param>
        /// <returns></returns>
        public static string EncodeSha512String(this string inputStr)
        {
            if (inputStr.IsNull())
                return null;

            using var sha512 = SHA512.Create();
            var buffer = Encoding.UTF8.GetBytes(inputStr);
            var byteArr = sha512.ComputeHash(buffer);
            return BitConverter.ToString(byteArr).Replace("-", "").ToLower();
        }

        #endregion
    }
}