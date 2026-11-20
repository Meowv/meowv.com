using System.Threading.RateLimiting;
using Meowv.Api.Core;
using Meowv.Api.Modules.Music.Providers;
using Meowv.Api.Modules.Music.QQ;
using Meowv.Api.Modules.Music.Storage;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Meowv.Api.Modules.Music;

public static class MusicRegistration
{
    public static IServiceCollection AddMusicModule(this IServiceCollection services, IConfiguration configuration)
    {
        var options = new MusicOptions();
        try
        {
            configuration.GetSection("Modules:Music").Bind(options);
        }
        catch (InvalidOperationException)
        {
            options.BindingFailed = true;
        }

        services.AddSingleton(options);
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<MusicRuntime>();
        services.AddSingleton<MusicDeviceStore>();
        services.AddSingleton<MusicChartStore>();
        services.AddSingleton<MusicDailyFeeds>();
        services.AddSingleton<MusicCandidateStore>();
        services.AddSingleton<MusicCandidatePool>();
        services.AddHostedService(provider => provider.GetRequiredService<MusicCandidatePool>());
        services.AddHttpClient("MusicNetease", client => client.Timeout = TimeSpan.FromSeconds(6))
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false, UseCookies = false, ConnectTimeout = TimeSpan.FromSeconds(3),
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            });
        services.AddSingleton<NeteaseMusicProvider>(provider => new NeteaseMusicProvider(
            provider.GetRequiredService<IHttpClientFactory>().CreateClient("MusicNetease"), provider.GetRequiredService<TimeProvider>()));
        services.AddHttpClient("MusicQQSkill", client => client.Timeout = TimeSpan.FromSeconds(3))
            .RemoveAllLoggers()
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false });
        services.AddSingleton(provider => new QQMusicSkill(
            provider.GetRequiredService<IHttpClientFactory>().CreateClient("MusicQQSkill"),
            options, provider.GetRequiredService<TimeProvider>(), provider.GetRequiredService<MusicChartStore>()));
        services.AddHttpClient("MusicQQ", client => client.Timeout = TimeSpan.FromSeconds(6))
            .RemoveAllLoggers()
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false, UseCookies = false, ConnectTimeout = TimeSpan.FromSeconds(3),
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            });
        services.AddSingleton<QQMusicProvider>(provider => new QQMusicProvider(
            provider.GetRequiredService<IHttpClientFactory>().CreateClient("MusicQQ"), provider.GetRequiredService<TimeProvider>()));
        services.AddSingleton<IMusicSearchProvider>(provider => provider.GetRequiredService<NeteaseMusicProvider>());
        services.AddSingleton<IMusicSearchProvider>(provider => provider.GetRequiredService<QQMusicProvider>());
        services.AddSingleton<MusicProviderRegistry>();
        services.AddSingleton<MusicCatalog>();
        services.AddSingleton<QQSessionStore>();
        services.AddSingleton<QQMembership>();
        services.AddSingleton(provider => new QQAccountClient(
            provider.GetRequiredService<IHttpClientFactory>().CreateClient("MusicQQ"), provider.GetRequiredService<TimeProvider>()));
        services.AddSingleton<IEndpointModule, MusicModule>();
        services.ConfigureHttpJsonOptions(json => json.SerializerOptions.TypeInfoResolverChain.Add(MusicJsonContext.Default));
        services.AddAuthentication().AddScheme<AuthenticationSchemeOptions, MusicAccessHandler>(MusicAccessHandler.SchemeName, _ => { });
        services.AddAuthorization(auth => auth.AddPolicy(MusicAccessHandler.SchemeName,
            policy => policy.AddAuthenticationSchemes(MusicAccessHandler.SchemeName).RequireAuthenticatedUser()));
        services.AddRateLimiter(limits =>
        {
            limits.AddPolicy("music", new MusicRatePolicy(options));
            AddIpLimit("music-register", 5);
            AddIpLimit("music-activation-status", 30);
            // 二维码状态轮询使用独立配额，保留管理写操作的额度。
            AddIpLimit("music-qq-status", 45);
            return;

            void AddIpLimit(string name, int permits) => limits.AddPolicy(name, context =>
                RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = permits, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true
                    }));
        });
        return services;
    }
}