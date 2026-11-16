using Meowv.Api.Core;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Modules.Music.Providers;
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
        services.AddSingleton<MusicDemoMedia>();
        services.AddSingleton<MusicRuntime>();
        services.AddSingleton<MusicDeviceStore>();
        services.AddSingleton<FakeMusicProvider>();
        services.AddSingleton<IMusicSearcher>(provider => provider.GetRequiredService<FakeMusicProvider>());
        services.AddSingleton<IRecommendationSource>(provider => provider.GetRequiredService<FakeMusicProvider>());
        services.AddSingleton<ITrackResolver>(provider => provider.GetRequiredService<FakeMusicProvider>());
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
    public string Description => "音乐候选与解析（开发测试来源）。";
    public void ConfigureMiddleware(IApplicationBuilder application) => application.UseMiddleware<MusicMiddleware>();

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        var music = endpoints.MapGroup("/api/music");
        music.MapGet("/health", (MusicRuntime runtime) => Results.Json(
            new MusicHealth(runtime.Status, runtime.Available ? 1 : 0, FakeMusicProvider.ConfigVersion),
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
        if (endpoints.ServiceProvider.GetRequiredService<MusicDemoMedia>().Configured)
            secured.MapMethods("/demo-audio/{name}", ["GET", "HEAD"], (string name, MusicDemoMedia media) =>
                media.PathFor(name) is { } path ? Results.File(path, "audio/mpeg", enableRangeProcessing: true) : Results.NotFound());
        secured.MapGet("/providers", (MusicRuntime runtime) => Results.Json(new MusicProviders(
                [new MusicProvider(FakeMusicProvider.Id, "原创测试音频", runtime.Status == "ready" ? "healthy" : "degraded", ["search", "resolve", "recommendations"], false)]),
            MusicJsonContext.Default.MusicProviders));
        secured.MapGet("/search", (HttpContext context, IMusicSearcher provider) => Results.Json(
            provider.Search(One(context, "q"), Limit(context), One(context, "cursor")), MusicJsonContext.Default.MusicSearchPage));
        secured.MapGet("/recommendations", (HttpContext context, IRecommendationSource provider) => Results.Json(
            provider.Recommend(Limit(context), One(context, "cursor")), MusicJsonContext.Default.MusicRecommendationPage));
        secured.MapPost("/resolve", async (HttpContext context, ITrackResolver provider) =>
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
            return Results.Json(provider.Resolve(input), MusicJsonContext.Default.MusicResolvedTrack);
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