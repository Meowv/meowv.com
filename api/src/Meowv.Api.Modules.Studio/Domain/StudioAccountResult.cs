namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioAccountResult<T>
{
    private StudioAccountResult(T? value, string? errorCode, string? errorMessage)
    {
        Value = value;
        ErrorCode = errorCode;
        ErrorMessage = errorMessage;
    }

    public T? Value { get; }

    public string? ErrorCode { get; }

    public string? ErrorMessage { get; }

    public bool Ok => ErrorCode is null;

    public static StudioAccountResult<T> Success(T value)
    {
        return new StudioAccountResult<T>(value, null, null);
    }

    public static StudioAccountResult<T> Failure(string code, string message)
    {
        return new StudioAccountResult<T>(default, code, message);
    }
}