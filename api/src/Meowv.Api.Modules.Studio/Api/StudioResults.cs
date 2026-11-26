namespace Meowv.Api.Modules.Studio.Api;

public static class StudioResults
{
    public static IResult From<T>(StudioAccountResult<T> result, HttpContext context, Func<T, IResult>? onSuccess = null)
    {
        if (result.Ok)
            return onSuccess is not null ? onSuccess(result.Value!) : Results.NoContent();

        var status = result.ErrorCode switch
        {
            StudioErrorCodes.Validation or StudioErrorCodes.InvalidToken => StatusCodes.Status400BadRequest,
            StudioErrorCodes.Conflict => StatusCodes.Status409Conflict,
            StudioErrorCodes.InvalidCredentials => StatusCodes.Status401Unauthorized,
            StudioErrorCodes.Unauthorized => StatusCodes.Status401Unauthorized,
            StudioErrorCodes.EmailUnverified => StatusCodes.Status403Forbidden,
            StudioErrorCodes.Forbidden => StatusCodes.Status403Forbidden,
            StudioErrorCodes.NotFound => StatusCodes.Status404NotFound,
            StudioErrorCodes.RegistrationDisabled => StatusCodes.Status403Forbidden,
            StudioErrorCodes.LastAdmin or StudioErrorCodes.SelfDelete => StatusCodes.Status409Conflict,
            StudioErrorCodes.Throttled => StatusCodes.Status429TooManyRequests,
            StudioErrorCodes.EmailNotConfigured => StatusCodes.Status503ServiceUnavailable,
            StudioErrorCodes.PayloadTooLarge => StatusCodes.Status413PayloadTooLarge,
            _ => StatusCodes.Status400BadRequest
        };

        return Error(status, result.ErrorMessage ?? "请求失败。", result.ErrorCode, context);
    }

    public static IResult Error(int status, string message, string? code, HttpContext context, List<StudioApiErrorDetail>? details = null)
    {
        var requestId = context.Items[StudioRequestIdMiddleware.ItemKey] as string;
        return Results.Json(new StudioApiError(message, code, requestId, details), StudioJson.Options, statusCode: status);
    }
}