using MongoDB.Bson;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System;

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
        /// Generate post link
        /// </summary>
        /// <param name="url"></param>
        /// <param name="time"></param>
        /// <returns></returns>
        public static string GeneratePostUrl(this string url, DateTime time)
        {
            return $"{time:/yyyy/MM/dd/}{url}";
        }
    }
}