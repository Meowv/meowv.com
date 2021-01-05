using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace Meowv.Blog.Extensions
{
    public static class Extensions
    {
        /// <summary>
        /// 将对象转换为json字符串
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
    }
}