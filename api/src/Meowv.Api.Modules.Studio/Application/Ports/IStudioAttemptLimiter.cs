namespace Meowv.Api.Modules.Studio.Application.Ports;

public interface IStudioAttemptLimiter
{
    bool IsBlocked(string key, DateTimeOffset now, out TimeSpan retryAfter);

    void RecordFailure(string key, DateTimeOffset now);

    void Reset(string key);
}