using Castle.Core.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Internal;
using Microsoft.AspNetCore.Mvc;
using System.IO;
using System.Text;

namespace MeowvBlog.SOA.Filters
{
    public class LogErrorHandler
    {
        /// <summary>
        /// 记录日志
        /// </summary>
        /// <param name="events"></param>
        /// <param name="context"></param>
        /// <param name="result"></param>
        public static void LogError(string events, HttpContext context, IActionResult result)
        {
            var logger = UPrime.UPrimeEngine.Instance.Resolve<ILogger>();
            if (context.IsNotNull() && context.Request.IsNotNull())
            {
                string paras;
                if (context.Request.QueryString.HasValue)
                {
                    paras = context.Request.QueryString.Value.ToString();
                }
                else
                {
                    try
                    {
                        paras = ReadBodyAsString(context.Request);
                    }
                    catch
                    {
                        paras = "ReadBodyAsString ExceptionOccurred";
                    }
                }

                var message = "【Event：{0}】【Path：{1}】【Request Params：{2}】【Content：{3}】".FormatWith(events, context.Request.Path.ToString(), paras, result.SerializeToJson());

                logger.Error(message);
            }
        }

        private static string ReadBodyAsString(HttpRequest request)
        {
            request.Body.Position = 0;
            request.EnableRewind();

            var result = string.Empty;
            using (var reader = new StreamReader(request.Body, Encoding.UTF8, true, 1024, true))
            {
                result = reader.ReadToEnd();
            }
            return result;
        }
    }
}