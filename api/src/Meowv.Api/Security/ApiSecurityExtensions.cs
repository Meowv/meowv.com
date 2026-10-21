using System.Threading.RateLimiting;
using System.Net;
using Meowv.Api.Core;
using Meowv.Api.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.HttpOverrides;

namespace Meowv.Api.Security;

public static class ApiSecurityExtensions
{
    public static IServiceCollection AddApiServices(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<ApiPaths>();
        services.AddSingleton<ApiDatabase>();
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            options.KnownProxies.Add(IPAddress.Loopback);
            options.KnownProxies.Add(IPAddress.IPv6Loopback);
        });
        services.AddOptions<SecurityOptions>().Bind(configuration.GetSection("Security"))
            .Validate(value => !string.IsNullOrWhiteSpace(value.BootstrapToken) && value.BootstrapToken.Length is >= 32 and <= 1024,
                "请配置至少 32 字符的 Security:BootstrapToken。开发密钥应放入 appsettings.Development.json，生产通过环境变量提供。")
            .ValidateOnStart();
        services.AddOptions<FfmpegOptions>().Bind(configuration.GetSection("Tools:FFmpeg"));
        var cors = new ApiCorsOptions();
        configuration.GetSection("Cors").Bind(cors);
        if (!ApiCorsOptions.IsValid(cors)) throw new InvalidOperationException("Cors:AllowedOrigins 必须是精确的 http/https Origin。");
        services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy => policy.WithOrigins(cors.AllowedOrigins).AllowAnyHeader().AllowAnyMethod());
            options.AddPolicy(ApiAuthorization.CorsPolicy, policy => policy.WithOrigins(cors.AllowedOrigins).AllowAnyHeader().AllowAnyMethod());
        });
        services.AddSingleton<IAccessCodeService, AccessCodeService>();
        services.AddHostedService<AuthInitializationService>();
        services.AddAuthentication(ApiAuthorization.AccessCodeScheme)
            .AddScheme<AuthenticationSchemeOptions, ApiAuthenticationHandler>(ApiAuthorization.AccessCodeScheme, _ => { })
            .AddScheme<AuthenticationSchemeOptions, ApiAuthenticationHandler>(ApiAuthorization.ManagementScheme, _ => { });
        services.AddAuthorization(options => options.AddPolicy(ApiAuthorization.ManagementPolicy,
            policy => policy.AddAuthenticationSchemes(ApiAuthorization.ManagementScheme).RequireAuthenticatedUser()));
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy("api-auth", context =>
                RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true,
                }));
        });
        return services;
    }
}

internal sealed class AuthInitializationService(IAccessCodeService codes) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _ = codes.GetVersion();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}