namespace Meowv.Api.Modules.Diagnostics.Configuration;

public static class DiagnosticsRegistration
{
    public static IServiceCollection AddDiagnosticsModule(this IServiceCollection services)
    {
        services.AddSingleton<IEndpointModule, DiagnosticsModule>();
        return services;
    }
}