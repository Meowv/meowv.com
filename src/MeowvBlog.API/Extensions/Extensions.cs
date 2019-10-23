using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.IO;
using System.Threading.Tasks;

namespace MeowvBlog.API.Extensions
{
    public static class Extensions
    {
        public static async Task<T> GetObjFromJsonFile<T>(this string filePath, string key = "") where T : new()
        {
            if (!File.Exists(filePath)) return new T();

            using StreamReader reader = new StreamReader(filePath);
            var json = await reader.ReadToEndAsync();

            if (string.IsNullOrEmpty(key)) return JsonConvert.DeserializeObject<T>(json);

            return !(JsonConvert.DeserializeObject<object>(json) is JObject obj) ? new T() : JsonConvert.DeserializeObject<T>(obj[key].ToString());
        }

        public static T DeserializeFromJson<T>(this string input)
        {
            return JsonConvert.DeserializeObject<T>(input);
        }
    }
}