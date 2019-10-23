using MeowvBlog.Core.MTA;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace MeowvBlog.API.Extensions
{
    public static class Extensions
    {
        /// <summary>
        /// GetObjFromJsonFile
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="filePath"></param>
        /// <param name="key"></param>
        /// <returns></returns>
        public static async Task<T> GetObjFromJsonFile<T>(this string filePath, string key = "") where T : new()
        {
            if (!File.Exists(filePath)) return new T();

            using StreamReader reader = new StreamReader(filePath);
            var json = await reader.ReadToEndAsync();

            if (string.IsNullOrEmpty(key)) return JsonConvert.DeserializeObject<T>(json);

            return !(JsonConvert.DeserializeObject<object>(json) is JObject obj) ? new T() : JsonConvert.DeserializeObject<T>(obj[key].ToString());
        }

        /// <summary>
        /// DeserializeFromJson
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="input"></param>
        /// <returns></returns>
        public static T DeserializeFromJson<T>(this string input)
        {
            return JsonConvert.DeserializeObject<T>(input);
        }

        /// <summary>
        /// ToMd5
        /// </summary>
        /// <param name="str"></param>
        /// <returns></returns>
        public static string ToMd5(this string str)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(str);
            bytes = new MD5CryptoServiceProvider().ComputeHash(bytes);
            string text = "";
            for (int i = 0; i < bytes.Length; i++)
            {
                text += bytes[i].ToString("x").PadLeft(2, '0');
            }
            return text;
        }

        /// <summary>
        /// 生成 MTA Sign
        /// </summary>
        /// <param name="keyValues"></param>
        /// <returns></returns>
        public static string GgenerateMtaSign(this Dictionary<string, string> keyValues)
        {
            keyValues.Add("app_id", MtaConfig.App_Id);

            IDictionary<string, string> sortedParams = new SortedDictionary<string, string>(keyValues);

            var iterator = sortedParams.GetEnumerator();

            var sb = new StringBuilder();

            while (iterator.MoveNext())
            {
                var key = iterator.Current.Key;
                var value = iterator.Current.Value;

                if (!string.IsNullOrEmpty(key) && !string.IsNullOrEmpty(value))
                {
                    sb.Append(key).Append("=").Append(value);
                }
            }

            return (MtaConfig.SECRET_KEY + sb.ToString()).ToMd5();
        }

        /// <summary>
        /// 生成 MTA URL 查询参数
        /// </summary>
        /// <param name="keyValues"></param>
        /// <returns></returns>
        public static string GgenerateMTAQuery(this Dictionary<string, string> keyValues)
        {
            var sign = keyValues.GgenerateMtaSign();

            var query = "?";

            foreach (var item in keyValues)
            {
                query += $"{item.Key}={item.Value}&";
            }

            return $"{query}sign={sign}";
        }
    }
}