using Castle.Core.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Internal;
using Microsoft.AspNetCore.Mvc;
using Plus;
using System;
using System.IO;
using System.Text;

namespace MeowvBlog.Web.Filters
{
    public static class LogErrorHelper
    {
        public static void LogError(string events, HttpContext context, IActionResult result)
        {
            var logger = PlusEngine.Instance.Resolve<ILogger>();

            if (context != null && context.Request != null)
            {
                var requestParams = string.Empty;
                if (context.Request.QueryString.HasValue)
                {
                    requestParams = context.Request.QueryString.Value.ToString();
                }
                else
                {
                    try
                    {
                        var request = context.Request;
                        request.Body.Position = 0;
                        request.EnableRewind();
                        using (StreamReader reader = new StreamReader(request.Body, Encoding.UTF8, true, 1024, true))
                        {
                            requestParams = reader.ReadToEnd();
                        }
                    }
                    catch (Exception ex)
                    {
                        requestParams = $"ReadBodyAsString occur expcetion：{ex.Message}";
                    }
                }

                var message = "【Event：{0}】【Path：{1}】【Request Params：{2}】【Content：{3}】".FormatWith(events, context.Request.Path.ToString(), requestParams, result.SerializeToJson());

                logger.Error(message);
            }
        }
    }
}