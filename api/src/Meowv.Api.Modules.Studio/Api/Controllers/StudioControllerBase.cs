using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Meowv.Api.Modules.Studio.Api.Controllers;

public abstract class StudioControllerBase : ControllerBase, IActionFilter
{
    [NonAction]
    public void OnActionExecuting(ActionExecutingContext context)
    {
        if (context.ModelState.IsValid) return;

        var details = context.ModelState
            .Where(entry => entry.Value?.Errors.Count > 0)
            .SelectMany(entry => entry.Value!.Errors.Select(error =>
                new StudioApiErrorDetail(entry.Key, string.IsNullOrWhiteSpace(error.ErrorMessage) ? "参数无效。" : error.ErrorMessage)))
            .ToList();

        throw new StudioApiException(StatusCodes.Status400BadRequest, "请求参数无效。", StudioErrorCodes.Validation, details);
    }

    [NonAction]
    public void OnActionExecuted(ActionExecutedContext context)
    {
    }
}