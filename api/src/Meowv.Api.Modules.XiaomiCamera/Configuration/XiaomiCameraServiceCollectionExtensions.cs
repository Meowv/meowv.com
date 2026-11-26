using System.Threading.RateLimiting;

namespace Meowv.Api.Modules.XiaomiCamera.Configuration;

public static class XiaomiCameraServiceCollectionExtensions
{
    public static IServiceCollection AddXiaomiCameraModule(this IServiceCollection services, IConfiguration configuration)
    {
        if (bool.TryParse(configuration["Modules:XiaomiCamera:Enabled"], out var enabled) && !enabled)
            return services;

        services.AddSingleton(provider => new XiaomiPlaybackLimits(provider.GetRequiredService<XiaomiCameraOptions>().MaxConcurrentStreams));
        services.AddSingleton<IEndpointModule, XiaomiCameraModule>();
        services.AddOptions<XiaomiModuleOptions>().Bind(configuration.GetSection("Modules:XiaomiCamera"));
        services.AddSingleton<XiaomiCameraOptions>();
        services.AddSingleton<XiaomiAccountLoginFlow>();
        services.AddSingleton<XiaomiCredentialCache>();
        services.AddSingleton<XiaomiCameraDirectoryService>();
        services.AddSingleton<XiaomiPlaybackTicketService>();
        services.AddSingleton<XiaomiLiveStreamService>();
        services.AddSingleton<XiaomiFfmpegResolver>();
        services.AddSingleton<XiaomiHlsService>();
        services.AddSingleton<XiaomiModuleRuntime>();
        services.AddHostedService(provider => provider.GetRequiredService<XiaomiModuleRuntime>());
        services.AddHttpClient("xiaomi-cloud", client => client.Timeout = TimeSpan.FromSeconds(20)).RemoveAllLoggers();
        services.ConfigureHttpJsonOptions(options => options.SerializerOptions.TypeInfoResolverChain.Add(XiaomiHttpJsonContext.Default));
        services.AddRateLimiter(options =>
        {
            options.AddPolicy("xiaomi-bootstrap", context => CreateLimiter(context, 10));
            options.AddPolicy("xiaomi-access-code", context => CreateLimiter(context, 30));
            options.AddPolicy("xiaomi-playback-session", context => CreateLimiter(context, 20));
            options.AddPolicy("xiaomi-motor", context => CreateLimiter(context, 20));
        });
        return services;
    }

    private static RateLimitPartition<string> CreateLimiter(HttpContext context, int permitLimit) =>
        RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permitLimit,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true,
        });
}