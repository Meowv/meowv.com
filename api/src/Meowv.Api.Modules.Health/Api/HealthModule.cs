namespace Meowv.Api.Modules.Health.Api;

public sealed class HealthModule : IEndpointModule
{
    public string Name => "health";

    public string Description => "服务存活探针。";
}