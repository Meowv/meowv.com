using MeowvBlog.Core.Configuration;
using System;
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
        public static SignatureUrl SignatureUrl(string name, int id)
        {
            var url = AppSettings.Signature.Urls.OrderBy(x => Guid.NewGuid()).FirstOrDefault();

            var signature = new SignatureUrl
            {
                Url = url.Key,
                Parameter = url.Value.FormatWith(name, id)
            };

            return signature;
        }
    }
}