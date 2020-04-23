using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.IO;
using System.Text;
using System.Threading.Tasks;

namespace Meowv.Blog.ToolKits.Extensions
{
    public static class SerializeExtensions
    {
        /// <summary>
        /// 实体对象转JSON字符串
        /// </summary>
        /// <param name="obj"></param>
        /// <param name="ignoreNull"></param>
        /// <returns></returns>
        public static string ToJson(this object obj, bool ignoreNull = false)
        {
            return JsonConvert.SerializeObject(obj, Formatting.None, new JsonSerializerSettings
            {
                DateFormatString = "yyyy-MM-dd HH:mm:ss",
                NullValueHandling = ignoreNull ? NullValueHandling.Ignore : NullValueHandling.Include
            });
        }

        /// <summary>
        /// JSON字符串转实体对象
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="jsonStr"></param>
        /// <returns></returns>
        public static T FromJson<T>(this string jsonStr)
        {
            return jsonStr.IsNullOrEmpty() ? default : JsonConvert.DeserializeObject<T>(jsonStr);
        }

        /// <summary>
        /// 字符串序列化成字节序列
        /// </summary>
        /// <param name="str"></param>
        /// <returns></returns>
        public static byte[] SerializeUtf8(this string str)
        {
            return str == null ? null : Encoding.UTF8.GetBytes(str);
        }

        /// <summary>
        /// 字节序列序列化成字符串
        /// </summary>
        /// <param name="stream"></param>
        /// <returns></returns>
        public static string DeserializeUtf8(this byte[] stream)
        {
            return stream == null ? null : Encoding.UTF8.GetString(stream);
        }

        /// <summary>
        /// 根据key将json文件内容转换为指定对象
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="filePath"></param>
        /// <param name="key"></param>
        /// <returns></returns>
        public static async Task<T> FromJsonFile<T>(this string filePath, string key = "") where T : new()
        {
            if (!File.Exists(filePath)) return new T();

            using StreamReader reader = new StreamReader(filePath);
            var json = await reader.ReadToEndAsync();

            if (string.IsNullOrEmpty(key)) return JsonConvert.DeserializeObject<T>(json);

            return !(JsonConvert.DeserializeObject<object>(json) is JObject obj) ? new T() : JsonConvert.DeserializeObject<T>(obj[key].ToString());
        }
    }
}