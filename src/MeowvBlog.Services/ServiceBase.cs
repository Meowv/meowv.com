using Plus;
using Plus.Domain.Uow;
using Plus.Services;
using System;

namespace MeowvBlog.Services
{
    public abstract class ServiceBase : ApplicationServiceBase
    {
        public IUnitOfWorkManager UnitOfWorkManager;

        protected ServiceBase()
        {
            UnitOfWorkManager = PlusEngine.Instance.Resolve<IUnitOfWorkManager>();
        }

        /// <summary>
        /// 19位纯数字GUID
        /// </summary>
        /// <returns></returns>
        public string GenerateGuid()
        {
            byte[] buffer = Guid.NewGuid().ToByteArray();
            return BitConverter.ToInt64(buffer, 0).ToString();
        }

        /// <summary>
        /// 返回纯文本内容
        /// </summary>
        /// <param name="content"></param>
        /// <param name="length"></param>
        /// <returns></returns>
        public string ReplaceHtml(string content, int length)
        {
            var result = System.Text.RegularExpressions.Regex.Replace(content, "<[^>]+>", "");
            result = System.Text.RegularExpressions.Regex.Replace(result, "&[^;]+;", "");

            if (result.Length > length) return result.Substring(0, length) + "...";

            return result;
        }
    }
}