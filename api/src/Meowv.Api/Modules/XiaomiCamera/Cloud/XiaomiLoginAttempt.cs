namespace Meowv.Api.Modules.XiaomiCamera.Cloud;

public sealed record XiaomiLoginAttempt(Guid? AttemptId, XiaomiCloudCredentials? Credentials, string? VerificationDestination, string? VerificationKind)
{
    public bool IsAuthenticated => Credentials is not null;

    public static XiaomiLoginAttempt Authenticated(XiaomiCloudCredentials credentials) => new(null, credentials, null, null);

    public static XiaomiLoginAttempt NeedsVerification(Guid attemptId, string? destination, string kind) => new(attemptId, null, destination, kind);
}