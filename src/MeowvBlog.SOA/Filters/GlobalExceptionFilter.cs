using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System.Net;
using UPrime.WebApi;

namespace MeowvBlog.SOA.Filters
{
    public class GlobalExceptionFilter : IExceptionFilter
    {
        /// <summary>
        /// 异常处理
        /// </summary>
        /// <param name="context"></param>
        public void OnException(ExceptionContext context)
        {
            var response = new UPrimeResponse();
            response.HandleException(context.Exception);

            var serializerSettings = new JsonSerializerSettings
            {
                ContractResolver = new CamelCasePropertyNamesContractResolver()
            };
            var content = JsonConvert.SerializeObject(response, Formatting.None, serializerSettings);
            context.Result = new ContentResult()
            {
                StatusCode = (int)HttpStatusCode.OK,
                Content = content
            };
            context.ExceptionHandled = true;

            LogErrorHandler.LogError("OnException", context.HttpContext, context.Result);
        }
    }
}