namespace Meowv.Api.SharedKernel;

public readonly record struct ApiCredential(ApiCredentialState State, string? Value, bool FromQuery)
{
    public bool Present => State != ApiCredentialState.Missing;
}