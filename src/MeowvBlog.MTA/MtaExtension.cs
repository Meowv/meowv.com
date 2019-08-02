using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

namespace MeowvBlog.MTA
{
    public static class MtaExtension
    {
        /// <summary>
        /// 生成sign
        /// </summary>
        /// <param name="keyValues"></param>
        /// <returns></returns>
        public static string GgenerateSign(this Dictionary<string, string> keyValues)
        {
            keyValues.Add("app_id", MtaConfig.App_Id);

            IDictionary<string, string> sortedParams = new SortedDictionary<string, string>(keyValues);

            var iterator = sortedParams.GetEnumerator();

            var sb = new StringBuilder();

            while (iterator.MoveNext())
            {
                var key = iterator.Current.Key;
                var value = iterator.Current.Value;

                if (key.IsNotNullOrEmpty() && value.IsNotNullOrEmpty())
                {
                    sb.Append(key).Append("=").Append(value);
                }
            }

            return (MtaConfig.SECRET_KEY + sb.ToString()).Md5();
        }

        /// <summary>
        /// 生成URL查询参数
        /// </summary>
        /// <param name="keyValues"></param>
        /// <returns></returns>
        public static string GgenerateQuery(this Dictionary<string, string> keyValues)
        {
            var sign = keyValues.GgenerateSign();

            var query = "?";

            keyValues.ForEach(x =>
            {
                query += $"{x.Key}={x.Value}&";
            });

            return $"{query}sign={sign}";
        }

        /// <summary>
        /// 获取MTA接口返回数据
        /// </summary>
        /// <param name="keyValues"></param>
        /// <returns></returns>
        public static async Task<string> GetMTAData(this Dictionary<string, string> keyValues, string api)
        {
            var url = $"{api}{keyValues.GgenerateQuery()}";

            var hwr = url.HWRequest();
            string result = hwr.HWRequestResult();

            return await Task.FromResult(result);
        }
    }
}