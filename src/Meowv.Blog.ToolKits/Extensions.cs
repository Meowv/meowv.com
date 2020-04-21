using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.IO;
using System.Threading.Tasks;

namespace Meowv.Blog.ToolKits
{
    public static class Extensions
    {
        /// <summary>
        /// 根据key将json文件内容转换为指定对象
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
        /// SerializeToJson
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public static string SerializeToJson(this object input)
        {
            return JsonConvert.SerializeObject(input);
        }
    }
}