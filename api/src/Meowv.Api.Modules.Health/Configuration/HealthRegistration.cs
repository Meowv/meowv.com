namespace Meowv.Api.Modules.Health.Configuration;

public static class HealthRegistration
{
    public static IServiceCollection AddHealthModule(this IServiceCollection services)
    {
        services.AddSingleton<IEndpointModule, HealthModule>();
        return services;
    }
}