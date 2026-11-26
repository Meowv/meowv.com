namespace Meowv.Api.Modules.XiaomiCamera.Api;

public sealed record XiaomiSetupResponse(string Status, Guid? AttemptId, string? VerificationKind, string? VerificationDestination, bool? UsedCachedSession)
{
    public static XiaomiSetupResponse NeedsVerification(Guid attemptId, string kind, string? destination) => new("verification_required", attemptId, kind, destination, null);

    public static XiaomiSetupResponse Completed(bool usedCachedSession) => new("completed", null, null, null, usedCachedSession);

    public static XiaomiSetupResponse LoginRequired() => new("login_required", null, null, null, false);
}