using MongoDB.Bson;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System;
using System.Globalization;

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
        /// String to MongoDb.Bson.ObjectId
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
    }
}