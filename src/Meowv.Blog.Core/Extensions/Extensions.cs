using MongoDB.Bson;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;

namespace Meowv.Blog.Extensions
{
    public static class Extensions
    {
        /// <summary>
        /// Convert object to json string
        /// </summary>
        /// <param name="obj"></param>
        /// <returns></returns>
        public static string SerializeToJson(this object obj)
        {
            return JsonConvert.SerializeObject(obj, Formatting.None, new JsonSerializerSettings
            {
                ContractResolver = new CamelCasePropertyNamesContractResolver()
            });
        }

        /// <summary>
        /// Convert json string to <typeparamref name="T"/>
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="json"></param>
        /// <returns></returns>
        public static T DeserializeToObject<T>(this string json)
        {
            return json.IsNullOrEmpty() ? default : JsonConvert.DeserializeObject<T>(json);
        }

        /// <summary>
        /// String to <see cref="ObjectId"/>
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public static ObjectId ToObjectId(this string id)
        {
            return new ObjectId(id);
        }

        /// <summary>
        /// The string time format is converted to DateTime
        /// </summary>
        /// <param name="time"></param>
        /// <param name="defaultValue"></param>
        /// <returns></returns>
        public static DateTime ToDateTime(this string time, DateTime defaultValue = default)
        {
            if (time.IsNullOrEmpty())
                return defaultValue;

            return DateTime.TryParse(time, out var dateTime) ? dateTime : defaultValue;
        }

        /// <summary>
        /// Generate post link
        /// </summary>
        /// <param name="url"></param>
        /// <param name="time"></param>
        /// <returns></returns>
        public static string GeneratePostUrl(this string url, DateTime time)
        {
            return $"{time:yyyy-MM-dd}-{url}";
        }

        /// <summary>
        /// Format time
        /// </summary>
        /// <param name="time"></param>
        /// <returns></returns>
        public static string FormatTime(this DateTime time)
        {
            return time.ToString("MMMM dd, yyyy HH:mm", new CultureInfo("en-us"));
        }

        /// <summary>
        /// Save the array type file to the specified path
        /// </summary>
        /// <param name="buffer"></param>
        /// <param name="path"></param>
        /// <returns></returns>
        public static async Task DownloadAsync(this byte[] buffer, string path)
        {
            using var ms = new MemoryStream(buffer);
            using var stream = new FileStream(path, FileMode.Create);

            var bytes = new byte[1024];
            var size = await ms.ReadAsync(bytes.AsMemory(0, bytes.Length));
            while (size > 0)
            {
                await stream.WriteAsync(bytes.AsMemory(0, size));
                size = await ms.ReadAsync(bytes.AsMemory(0, bytes.Length));
            }
        }
    }
}