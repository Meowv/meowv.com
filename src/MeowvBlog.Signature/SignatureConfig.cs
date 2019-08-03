using Plus;
using System;
using System.Collections.Generic;
using System.Linq;

namespace MeowvBlog.Signature
{
    public class SignatureConfig
    {
        /// <summary>
        /// 返回签名URL和请求参数
        /// </summary>
        /// <param name="name"></param>
        /// <param name="id"></param>
        /// <returns></returns>
        public static NameValue<string> SignatureUrl(string name, int id)
        {
            IDictionary<string, string> keyValues = new Dictionary<string, string>
            {
                
            };

            var url = keyValues.OrderBy(x => Guid.NewGuid()).FirstOrDefault();

            return new NameValue<string>
            {
                Name = url.Key,
                Value = url.Value.FormatWith(name, id)
            };
        }
    }
}