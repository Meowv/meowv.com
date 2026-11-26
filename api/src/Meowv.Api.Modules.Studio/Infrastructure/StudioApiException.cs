namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioApiException(int statusCode, string message, string? code = null, List<StudioApiErrorDetail>? details = null) : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    public string? Code { get; } = code;

    public List<StudioApiErrorDetail>? Details { get; } = details;

    public static StudioApiException BadRequest(string message, string? code = null)
    {
        return new StudioApiException(StatusCodes.Status400BadRequest, message, code);
    }

    public static StudioApiException Unauthorized(string message, string? code = null)
    {
        return new StudioApiException(StatusCodes.Status401Unauthorized, message, code);
    }

    public static StudioApiException Forbidden(string message, string? code = null)
    {
        return new StudioApiException(StatusCodes.Status403Forbidden, message, code);
    }

    public static StudioApiException NotFound(string message, string? code = null)
    {
        return new StudioApiException(StatusCodes.Status404NotFound, message, code);
    }

    public static StudioApiException Conflict(string message, string? code = null)
    {
        return new StudioApiException(StatusCodes.Status409Conflict, message, code);
    }

    public static StudioApiException TooManyRequests(string message, string? code = null)
    {
        return new StudioApiException(StatusCodes.Status429TooManyRequests, message, code);
    }
}