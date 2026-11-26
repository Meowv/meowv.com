namespace Meowv.Api.Modules.Auth.Api;

public sealed class AuthModule : IEndpointModule
{
    public string Name => "auth";

    public string Description => "应用授权码管理。";
}