using System.Collections.Generic;
using System.Text;

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
    }
}