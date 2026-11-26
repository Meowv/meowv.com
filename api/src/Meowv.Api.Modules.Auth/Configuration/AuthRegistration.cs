namespace Meowv.Api.Modules.Auth.Configuration;

public static class AuthRegistration
{
    public static IServiceCollection AddAuthModule(this IServiceCollection services, IConfiguration? configuration = null)
    {
        services.AddSingleton<IEndpointModule, AuthModule>();
        services.AddSingleton<IAccessCodeService, AccessCodeService>();
        services.AddHostedService<AuthInitializationService>();
        return services;
    }
}