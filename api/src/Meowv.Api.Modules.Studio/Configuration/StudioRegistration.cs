using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;

namespace Meowv.Api.Modules.Studio.Configuration;

public static class StudioRegistration
{
    public static IServiceCollection AddStudioModule(this IServiceCollection services, IConfiguration configuration)
    {
        var options = new StudioOptions();
        configuration.GetSection(StudioOptions.SectionName).Bind(options);

        var jwt = new StudioJwtOptions();
        configuration.GetSection($"{StudioOptions.SectionName}:Jwt").Bind(jwt);

        var smtp = new StudioSmtpOptions();
        configuration.GetSection($"{StudioOptions.SectionName}:Smtp").Bind(smtp);

        if (smtp.IsConfigured && !string.Equals(smtp.Security, "StartTls", StringComparison.OrdinalIgnoreCase) && !string.Equals(smtp.Security, "None", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Modules:Studio:Smtp:Security 仅支持 StartTls 或 None。");

        services.AddSingleton(options);
        services.AddSingleton(jwt);
        services.AddSingleton(smtp);

        services.AddSingleton<IStudioClock, StudioSystemClock>();
        services.AddSingleton<StudioDatabase>();
        services.AddSingleton<IStudioStore, StudioAccountStore>();
        services.AddSingleton<IStudioPasswordHasher, StudioPasswordHasher>();
        services.AddSingleton<IStudioOneTimeTokenService, StudioOneTimeTokenService>();
        services.AddSingleton<IStudioAttemptLimiter, StudioAttemptLimiter>();
        services.AddSingleton<IStudioUserAssetStore, StudioUserAssetStore>();
        services.AddSingleton<IStudioEmailSender, StudioSmtpEmailSender>();
        services.AddSingleton<StudioJwtKeyProvider>();
        services.AddSingleton<StudioTokenService>();
        services.AddSingleton<IStudioTokenService>(provider => provider.GetRequiredService<StudioTokenService>());
        services.AddSingleton<IStudioLayoutCodec, StudioLayoutCodec>();

        services.AddScoped<StudioAuthService>();
        services.AddScoped<StudioUserService>();
        services.AddScoped<StudioLayoutService>();
        services.AddScoped<StudioAdminService>();

        services.AddSingleton<IEndpointModule, StudioModule>();
        services.AddHostedService<StudioInitializationService>();
        services.AddHostedService<StudioEmailDispatcher>();

        services.ConfigureHttpJsonOptions(json => json.SerializerOptions.TypeInfoResolverChain.Insert(0, StudioJsonContext.Default));

        services.AddAuthentication().AddScheme<AuthenticationSchemeOptions, StudioAuthenticationHandler>(StudioPolicies.SchemeName, _ => { });

        services.AddAuthorization(auth =>
        {
            auth.AddPolicy(StudioPolicies.User, policy => policy
                .AddAuthenticationSchemes(StudioPolicies.SchemeName)
                .RequireAuthenticatedUser());

            auth.AddPolicy(StudioPolicies.Verified, policy => policy
                .AddAuthenticationSchemes(StudioPolicies.SchemeName)
                .RequireAuthenticatedUser()
                .RequireClaim(StudioPolicies.EmailVerifiedClaim, "true"));

            auth.AddPolicy(StudioPolicies.Admin, policy => policy
                .AddAuthenticationSchemes(StudioPolicies.SchemeName)
                .RequireAuthenticatedUser()
                .RequireClaim(StudioPolicies.RoleClaim, "admin"));
        });

        services.AddSingleton<IAuthorizationMiddlewareResultHandler, StudioAuthorizationResultHandler>();

        services.AddRateLimiter(limits =>
        {
            limits.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            AddIpPolicy(limits, "studio-auth", 20, TimeSpan.FromMinutes(1));
            AddIpPolicy(limits, "studio-read", 120, TimeSpan.FromMinutes(1));
            AddIpPolicy(limits, "studio-write", 60, TimeSpan.FromMinutes(1));
            AddIpPolicy(limits, "studio-admin", 30, TimeSpan.FromMinutes(1));
            AddIpPolicy(limits, "studio-setup", 6, TimeSpan.FromMinutes(1));
        });

        return services;
    }

    private static void AddIpPolicy(RateLimiterOptions limits, string name, int permitLimit, TimeSpan window)
    {
        limits.AddPolicy(name, context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permitLimit,
                Window = window,
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    }
}