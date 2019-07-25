using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using Plus.WebApi;
using System.Net;

namespace MeowvBlog.Web.Filters
{
    public class GlobalExceptionFilter : IExceptionFilter
    {
        public void OnException(ExceptionContext context)
        {
            var response = new Response();
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

            LogErrorHelper.LogError("OnException", context.HttpContext, context.Result);
        }
    }
}