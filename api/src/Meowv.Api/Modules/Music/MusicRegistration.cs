using Meowv.Api.Core;
using Meowv.Api.Modules.Music.Providers;
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
            options, provider.GetRequiredService<TimeProvider>()));
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
        services.AddSingleton<IEndpointModule, MusicModule>();
        services.ConfigureHttpJsonOptions(json => json.SerializerOptions.TypeInfoResolverChain.Add(MusicJsonContext.Default));
        services.AddAuthentication().AddScheme<AuthenticationSchemeOptions, MusicAccessHandler>(MusicAccessHandler.SchemeName, _ => { });
        services.AddAuthorization(auth => auth.AddPolicy(MusicAccessHandler.SchemeName,
            policy => policy.AddAuthenticationSchemes(MusicAccessHandler.SchemeName).RequireAuthenticatedUser()));
        services.AddRateLimiter(limits => limits.AddPolicy("music", new MusicRatePolicy(options)));
        return services;
    }
}