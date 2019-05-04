using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using UPrime.WebApi;

namespace MeowvBlog.SOA.Filters
{
    public class ParameterValidateFilter : ActionFilterAttribute
    {
        /// <summary>
        /// Action方法执行后异常处理，避免直接抛出异常
        /// </summary>
        /// <param name="context"></param>
        public override void OnActionExecuted(ActionExecutedContext context)
        {
            if (context.Exception.IsNotNull())
            {
                var response = new UPrimeResponse();
                response.HandleException(context.Exception);

                context.Result = new ContentResult()
                {
                    StatusCode = (int)HttpStatusCode.BadRequest,
                    Content = response.SerializeToJson()
                };

                LogErrorHandler.LogError("OnActionExecuted", context.HttpContext, context.Result);
            }
        }

        /// <summary>
        /// Action方法执行前参数校验
        /// </summary>
        /// <param name="context"></param>
        public override void OnActionExecuting(ActionExecutingContext context)
        {
            if (!context.ModelState.IsValid)
            {
                var modelStateErrors = new Dictionary<string, IEnumerable<string>>();
                context.ModelState.ForEach(state =>
                {
                    var key = state.Key;
                    var errors = state.Value.Errors;
                    if (errors.IsNotNull() && errors.Count > 0)
                    {
                        var errorMessages = errors.Select(error => error.Exception.IsNotNull() ? error.Exception.Message : (error.ErrorMessage.IsNullOrEmpty() ? "An error has occurred" : error.ErrorMessage));

                        if (errorMessages.Count() > 0)
                        {
                            modelStateErrors.Add(key, errorMessages);
                        }
                    }

                    var response = new UPrimeResponse<Dictionary<string, IEnumerable<string>>>();
                    response.SetMessage(UPrimeResponseStatusCode.RequestParameterIsWrong);
                    response.Result = modelStateErrors;
                    context.Result = new ContentResult()
                    {
                        StatusCode = (int)HttpStatusCode.BadRequest,
                        Content = response.SerializeToJson()
                    };
                });

                LogErrorHandler.LogError("OnActionExecuting", context.HttpContext, context.Result);
            }
        }
    }
}