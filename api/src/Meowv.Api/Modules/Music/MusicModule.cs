using Meowv.Api.Core;
using Meowv.Api.Modules.Music.Contracts;
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
        services.AddHttpClient("MusicQQChart", client => client.Timeout = TimeSpan.FromSeconds(6))
            .RemoveAllLoggers()
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false, UseCookies = false, ConnectTimeout = TimeSpan.FromSeconds(3)
            });
        services.AddSingleton<QQMusicChart>(provider => new QQMusicChart(
            provider.GetRequiredService<IHttpClientFactory>().CreateClient("MusicQQChart"),
            provider.GetRequiredService<MusicChartStore>(), provider.GetRequiredService<TimeProvider>()));
        if (options is { Enabled: true, QQChartEnabled: true })
        {
            services.AddSingleton<MusicChartRecommendations>();
            services.AddHostedService(provider => provider.GetRequiredService<MusicChartRecommendations>());
        }
        services.AddHttpClient("MusicNetease", client => client.Timeout = TimeSpan.FromSeconds(6))
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false, UseCookies = false, ConnectTimeout = TimeSpan.FromSeconds(3),
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            });
        services.AddSingleton<NeteaseMusicProvider>(provider => new NeteaseMusicProvider(
            provider.GetRequiredService<IHttpClientFactory>().CreateClient("MusicNetease"), provider.GetRequiredService<TimeProvider>()));
        services.AddHttpClient("MusicKuwo", client => client.Timeout = TimeSpan.FromSeconds(6))
            .RemoveAllLoggers()
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false, UseCookies = false, ConnectTimeout = TimeSpan.FromSeconds(3),
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            });
        services.AddSingleton<KuwoSearchProvider>(provider => new KuwoSearchProvider(
            provider.GetRequiredService<IHttpClientFactory>().CreateClient("MusicKuwo"), provider.GetRequiredService<TimeProvider>()));
        services.AddSingleton<IMusicSearchProvider>(provider => provider.GetRequiredService<NeteaseMusicProvider>());
        services.AddSingleton<IMusicSearchProvider>(provider => provider.GetRequiredService<KuwoSearchProvider>());
        services.AddSingleton<IMusicSearchProvider, IncompetechMusicProvider>();
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

public sealed class MusicModule : IEndpointModule
{
    public string Name => "music";
    public string Description => "音乐搜索、候选与播放资源解析。";
    public void ConfigureMiddleware(IApplicationBuilder application) => application.UseMiddleware<MusicMiddleware>();

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        var music = endpoints.MapGroup("/api/music");
        music.MapGet("/health", (MusicRuntime runtime, MusicCatalog catalog) => Results.Json(
            new MusicHealth(catalog.Status(runtime.Status), runtime.Available ? catalog.EnabledCount : 0, catalog.Version),
            MusicJsonContext.Default.MusicHealth, statusCode: runtime.Status is "disabled" or "unavailable" ? 503 : 200));
        if (!endpoints.ServiceProvider.GetRequiredService<MusicOptions>().Enabled) return;
        if (endpoints.ServiceProvider.GetRequiredService<MusicOptions>().DeviceCredentialsEnabled)
        {
            var setup = music.MapGroup("/setup/devices").RequireAuthorization(ApiAuthorization.ManagementPolicy)
                .RequireRateLimiting("api-auth");
            setup.MapGet("", (MusicDeviceStore devices) => Results.Json(devices.List(), MusicJsonContext.Default.MusicDeviceArray));
            setup.MapPost("", async (HttpContext context, MusicDeviceStore devices) =>
            {
                if (!context.Request.HasJsonContentType()) throw MusicException.Invalid();
                var bytes = new byte[4097];
                var length = 0;
                while (length < bytes.Length)
                {
                    var read = await context.Request.Body.ReadAsync(bytes.AsMemory(length), context.RequestAborted);
                    if (read == 0) break;
                    length += read;
                }

                if (length > 4096) throw MusicException.Invalid();
                var input = System.Text.Json.JsonSerializer.Deserialize(bytes.AsSpan(0, length), MusicJsonContext.Default.MusicDeviceRequest);
                if (input is null) throw MusicException.Invalid();
                return Results.Json(devices.Issue(input.Alias), MusicJsonContext.Default.MusicDeviceIssued, statusCode: 201);
            });
            setup.MapDelete("/{id}", (string id, MusicDeviceStore devices) => devices.Revoke(id) ? Results.NoContent() : Results.NotFound());
        }

        var secured = music.MapGroup("").RequireAuthorization(MusicAccessHandler.SchemeName)
            .WithMetadata(new MusicProtectedEndpoint(), new EndpointAccessMetadata("音乐专用设备令牌"))
            .RequireRateLimiting("music");
        if (endpoints.ServiceProvider.GetRequiredService<MusicOptions>().QQChartEnabled)
        {
            secured.MapGet("/charts/daily", async (QQMusicChart chart, CancellationToken ct) =>
                Results.Json(await chart.GetAsync(false, ct), MusicChartJsonContext.Default.MusicChartPage));
            music.MapPost("/admin/charts/refresh", async (MusicRuntime runtime, QQMusicChart chart, CancellationToken ct) =>
            {
                if (!runtime.Available) throw new MusicException("source_unavailable", "音乐服务尚未就绪。", 503);
                return Results.Json(await chart.GetAsync(true, ct), MusicChartJsonContext.Default.MusicChartPage);
            }).RequireAuthorization(ApiAuthorization.ManagementPolicy).RequireRateLimiting("api-auth");
        }
        secured.MapGet("/providers", (MusicCatalog catalog) => Results.Json(new MusicProviders(
                catalog.Providers()),
            MusicJsonContext.Default.MusicProviders));
        secured.MapGet("/search", async (HttpContext context, MusicCatalog catalog) => Results.Json(
            await catalog.SearchAsync(One(context, "q"), Limit(context), One(context, "cursor"), context.RequestAborted), MusicJsonContext.Default.MusicSearchPage));
        secured.MapGet("/recommendations", async (HttpContext context, MusicCatalog catalog) =>
        {
            var limit = Limit(context);
            var cursor = One(context, "cursor");
            var page = await catalog.RecommendAsync(limit, cursor, context.RequestAborted);
            if (cursor is null && context.RequestServices.GetService<MusicChartRecommendations>() is { } chart)
                page = chart.Mix(page, limit ?? 20);
            return Results.Json(page, MusicJsonContext.Default.MusicRecommendationPage);
        });
        secured.MapPost("/resolve", async (HttpContext context, MusicCatalog catalog) =>
        {
            if (!context.Request.HasJsonContentType()) throw MusicException.Invalid();
            var bytes = new byte[4097];
            var length = 0;
            while (length < bytes.Length)
            {
                var read = await context.Request.Body.ReadAsync(bytes.AsMemory(length), context.RequestAborted);
                if (read == 0) break;
                length += read;
            }

            if (length > 4096) throw MusicException.Invalid();
            var input = System.Text.Json.JsonSerializer.Deserialize(bytes.AsSpan(0, length), MusicJsonContext.Default.MusicResolveRequest);
            if (input is null) throw MusicException.Invalid();
            return Results.Json(await catalog.ResolveAsync(input, context.RequestAborted), MusicJsonContext.Default.MusicResolvedTrack);
        });
    }

    private static string? One(HttpContext context, string name)
    {
        var values = context.Request.Query[name];
        if (values.Count > 1) throw MusicException.Invalid();
        return values.Count == 0 ? null : values[0];
    }

    private static int? Limit(HttpContext context)
    {
        var text = One(context, "limit");
        if (text is null) return null;
        return !int.TryParse(text, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var limit) ? throw MusicException.Invalid() : limit;
    }
}
