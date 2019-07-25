using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Plus.WebApi;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;

namespace MeowvBlog.Web.Filters
{
    public class ActionParameterValidateAttribute : ActionFilterAttribute
    {
        /// <summary>
        /// Action方法执行前参数校验
        /// </summary>
        /// <param name="context"></param>
        public override void OnActionExecuting(ActionExecutingContext context)
        {
            if (!context.ModelState.IsValid)
            {
                var modelStateErrors = new Dictionary<string, IEnumerable<string>>();
                foreach (var state in context.ModelState)
                {
                    var key = state.Key;
                    var errors = state.Value.Errors;
                    if (errors != null && errors.Count > 0)
                    {
                        var errorMessages = errors.Select(error =>
                        {
                            return error.Exception != null ? error.Exception.Message : (String.IsNullOrEmpty(error.ErrorMessage) ? "An error has occurred " : error.ErrorMessage);
                        });
                        if (errorMessages.Count() > 0)
                        {
                            modelStateErrors.Add(key, errorMessages);
                        }
                    }
                    var response = new Response<Dictionary<string, IEnumerable<string>>>();
                    response.SetMessage(ResponseStatusCode.RequestParameterIsWrong);
                    response.Result = modelStateErrors;
                    context.Result = new ContentResult()
                    {
                        StatusCode = (int)HttpStatusCode.BadRequest,
                        Content = response.SerializeToJson()
                    };
                }
                LogErrorHelper.LogError("OnActionExecuting", context.HttpContext, context.Result);
            }
        }

        /// <summary>
        /// Action方法执行后异常处理,避免直接抛出异常
        /// </summary>
        /// <param name="context"></param>
        public override void OnActionExecuted(ActionExecutedContext context)
        {
            if (context.Exception.IsNotNull())
            {
                var response = new Response();
                response.HandleException(context.Exception);

                context.Result = new ContentResult()
                {
                    StatusCode = (int)HttpStatusCode.BadRequest,
                    Content = response.SerializeToJson()
                };

                LogErrorHelper.LogError("OnActionExecuted", context.HttpContext, context.Result);
            }
        }
    }
}