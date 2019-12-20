using MeowvBlog.API.Configurations;
using MeowvBlog.API.Models.Dto.Response;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Linq.Expressions;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace MeowvBlog.API.Extensions
{
    /// <summary>
    /// 一些常用的扩展方法类
    /// </summary>
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

        /// <summary>
        /// ToMd5
        /// </summary>
        /// <param name="str"></param>
        /// <returns></returns>
        public static string ToMd5(this string str)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(str);

            using var md5 = new MD5CryptoServiceProvider();
            bytes = md5.ComputeHash(bytes);

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

        /// <summary>
        /// Guid转换为纯数字
        /// </summary>
        /// <returns></returns>
        public static string GenerateNumber(this Guid guid)
        {
            var buffer = guid.ToByteArray();
            return BitConverter.ToInt64(buffer, 0).ToString();
        }

        /// <summary>
        /// 将 Enum 转换为 List
        /// </summary>
        /// <param name="type"></param>
        /// <returns></returns>
        public static IList<EnumResponse> EnumToList(this Type type)
        {
            var result = new List<EnumResponse>();

            foreach (var item in Enum.GetValues(type))
            {
                var dto = new EnumResponse
                {
                    Key = item.ToString(),
                    Value = Convert.ToInt32(item)
                };

                var objArray = item.GetType().GetField(item.ToString()).GetCustomAttributes(typeof(DescriptionAttribute), true);
                if (objArray.Any()) dto.Description = (objArray.First() as DescriptionAttribute).Description;

                result.Add(dto);
            }

            return result;
        }

        /// <summary>
        /// 随机化 IEnumerable
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="source"></param>
        /// <returns></returns>
        public static IEnumerable<T> Randomize<T>(this IEnumerable<T> source)
        {
            Random rnd = new Random();
            return source.OrderBy((item) => rnd.Next());
        }

        /// <summary>
        /// 时间格式转换
        /// </summary>
        /// <param name="date"></param>
        /// <returns></returns>
        public static string ToDateTimeForEn(this DateTime date)
        {
            return date.ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us"));
        }

        /// <summary>
        /// 时间格式转换
        /// </summary>
        /// <param name="date"></param>
        /// <param name="format"></param>
        /// <returns></returns>
        public static string ToDateTime(this DateTime date, string format = "yyyy-MM-dd HH:mm:ss")
        {
            return date.ToString(format);
        }

        /// <summary>
        /// 移除HTML标签
        /// </summary>
        /// <param name="content"></param>
        /// <param name="length"></param>
        /// <returns></returns>
        public static string ReplaceHtml(this string content, int length = 200)
        {
            var result = System.Text.RegularExpressions.Regex.Replace(content, "<[^>]+>", "");
            result = System.Text.RegularExpressions.Regex.Replace(result, "&[^;]+;", "");

            if (result.Length > length) return result.Substring(0, length) + "...";

            return result;
        }

        /// <summary>
        /// Select查询后自动执行ToList()
        /// </summary>
        /// <typeparam name="TSource"></typeparam>
        /// <typeparam name="TResult"></typeparam>
        /// <param name="source"></param>
        /// <param name="selector"></param>
        /// <returns></returns>
        public static List<TResult> SelectToList<TSource, TResult>(this IEnumerable<TSource> source, Func<TSource, TResult> selector)
        {
            return source.Select(selector).ToList();
        }

        /// <summary>
        /// Select查询后自动执行ToListAsync()
        /// </summary>
        /// <typeparam name="TSource"></typeparam>
        /// <typeparam name="TResult"></typeparam>
        /// <param name="source"></param>
        /// <param name="selector"></param>
        /// <returns></returns>
        public static Task<List<TResult>> SelectToListAsync<TSource, TResult>(this IQueryable<TSource> source, Expression<Func<TSource, TResult>> selector)
        {
            return source.Select(selector).ToListAsync();
        }

        /// <summary>
        /// WhereIf，满足条件进行查询
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="query"></param>
        /// <param name="condition"></param>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public static IQueryable<T> WhereIf<T>(this IQueryable<T> query, bool condition, Expression<Func<T, int, bool>> predicate)
        {
            return condition ? query.Where(predicate) : query;
        }

        /// <summary>
        /// WhereIf，满足条件进行查询
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="query"></param>
        /// <param name="condition"></param>
        /// <param name="predicate"></param>
        /// <returns></returns>
        public static IQueryable<T> WhereIf<T>(this IQueryable<T> query, bool condition, Expression<Func<T, bool>> predicate)
        {
            return condition ? query.Where(predicate) : query;
        }

        /// <summary>
        /// 将转换为byte[]类型的图片保存至指定路径
        /// </summary>
        /// <param name="buffer"></param>
        /// <param name="path"></param>
        /// <returns></returns>
        public static async Task SaveImg(this byte[] buffer, string path)
        {
            using var ms = new MemoryStream(buffer);
            using var stream = new FileStream(path, FileMode.Create);

            var bytes = new byte[1024];
            var size = await ms.ReadAsync(bytes, 0, bytes.Length);
            while (size > 0)
            {
                await stream.WriteAsync(bytes, 0, size);
                size = await ms.ReadAsync(bytes, 0, bytes.Length);
            }
        }

        /// <summary>
        /// 将时间戳转换为DateTime
        /// </summary>
        /// <param name="timestamp"></param>
        /// <returns></returns>
        public static DateTime ToDateTime(this string timestamp)
        {
            var ticks = 621355968000000000 + long.Parse(timestamp) * 10000;
            return new DateTime(ticks);
        }
    }
}