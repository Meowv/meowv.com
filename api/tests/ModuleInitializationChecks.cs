using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Meowv.Api.Core;
using Meowv.Api.Infrastructure;
using Meowv.Api.Modules.XiaomiCamera;
using Meowv.Api.Security;

internal static class ModuleInitializationChecks
{
    public static async Task RunAsync(string root)
    {
        var cases = new (string Key, string Value)[]
        {
            ("MaxConcurrentStreams", "0"),
            ("MaxConcurrentStreams", "-1"),
            ("MaxConcurrentStreams", "invalid"),
            ("Enabled", "invalid"),
            ("Media:Profile", "invalid"),
            ("DatabaseSchema", "1"),
        };
        foreach (var (key, value) in cases)
        {
            var builder = ApiConfiguration.CreateBuilder([
                "--contentRoot", root,
                "--ConnectionStrings:DefaultConnection", $"Data Source={Guid.NewGuid():N}.db",
                "--Modules:XiaomiCamera:Enabled", "true",
                $"--Modules:XiaomiCamera:{key}", value,
            ]);
            builder.Logging.ClearProviders();
            builder.Services.AddApiServices(builder.Configuration);
            builder.Services.AddXiaomiCameraModule(builder.Configuration);
            await using var app = builder.Build();
            var schemaMismatch = key == "DatabaseSchema";
            if (schemaMismatch)
            {
                // 合成旧结构只用于验证诊断和数据保护，不执行兼容迁移。
                app.Services.GetRequiredService<ApiDatabase>().EnsureSchema("xiaomi-camera", 1,
                    "CREATE TABLE xiaomi_camera_state(id INTEGER PRIMARY KEY, credentials_ciphertext BLOB);");
            }
            app.Urls.Add("http://127.0.0.1:0");
            app.UseRouting();
            app.UseCors();
            app.UseRateLimiter();
            app.UseMiddleware<XiaomiModuleAvailabilityMiddleware>();
            app.UseAuthentication();
            app.UseAuthorization();
            new Meowv.Api.Modules.Auth.AuthModule().MapEndpoints(app);
            app.MapGet("/api/health", () => "healthy");
            app.MapGet("/api/xiaomi-camera/probe", () => "must not run")
                .WithMetadata(new XiaomiEndpointMetadata());
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            await app.StartAsync(timeout.Token);
            using var client = new HttpClient(new HttpClientHandler { UseProxy = false })
                { BaseAddress = new Uri(app.Urls.Single()), Timeout = TimeSpan.FromSeconds(10) };
            if (app.Services.GetRequiredService<XiaomiModuleRuntime>().Status != "unavailable" ||
                (await client.GetAsync("/api/health")).StatusCode != HttpStatusCode.OK ||
                (await client.PostAsync("/api/auth/access-code", null)).StatusCode != HttpStatusCode.Unauthorized ||
                (await client.GetAsync("/api/xiaomi-camera/probe")).StatusCode != HttpStatusCode.ServiceUnavailable)
                throw new Exception("Invalid camera configuration must not stop common endpoints: " + key);
            if (schemaMismatch)
            {
                var reason = app.Services.GetRequiredService<XiaomiModuleRuntime>().FailureReason ?? "";
                if (!reason.Contains("当前版本 1") || !reason.Contains("版本 2"))
                    throw new Exception("Schema mismatch must report both versions without configuration values.");
                using var connection = app.Services.GetRequiredService<ApiDatabase>().OpenConnection();
                using var command = connection.CreateCommand();
                command.CommandText = "SELECT version FROM schema_migrations WHERE owner = 'xiaomi-camera';";
                if ((long)command.ExecuteScalar()! != 1)
                    throw new Exception("Schema mismatch must not silently change existing data.");
            }
            else
            {
                try
                {
                    _ = app.Services.GetRequiredService<XiaomiCameraOptions>();
                    throw new Exception("Invalid camera configuration must fail option resolution: " + key);
                }
                catch (InvalidOperationException) { }
            }
            await app.StopAsync(timeout.Token);
        }

        var disabled = ApiConfiguration.CreateBuilder([
            "--contentRoot", root,
            "--Modules:XiaomiCamera:Enabled", "false",
            "--Modules:XiaomiCamera:MaxConcurrentStreams", "invalid",
        ]);
        disabled.Services.AddXiaomiCameraModule(disabled.Configuration);
        await using var disabledApp = disabled.Build();
        if (disabledApp.Services.GetService<XiaomiModuleRuntime>() is not null)
            throw new Exception("Disabled camera module must not register or validate dependencies.");

        var valid = ApiConfiguration.CreateBuilder([
            "--contentRoot", root,
            "--Modules:XiaomiCamera:Enabled", "true",
            "--Modules:XiaomiCamera:MaxConcurrentStreams", "3",
        ]);
        valid.Services.AddApiServices(valid.Configuration);
        valid.Services.AddXiaomiCameraModule(valid.Configuration);
        await using var validApp = valid.Build();
        if (validApp.Services.GetRequiredService<XiaomiPlaybackLimits>().MaxConcurrentStreams != 3)
            throw new Exception("Valid stream limit must reach media capacity configuration.");
    }
}

// 定向宿主链接真实的模块注册、选项和初始化中间件；以下占位类型不执行登录或媒体链路。
namespace Meowv.Api.Modules.XiaomiCamera
{
    public sealed class XiaomiCameraModule : IEndpointModule
    {
        public string Name => "xiaomi-camera";
        public string Description => "模块故障隔离测试";
        public void MapEndpoints(IEndpointRouteBuilder endpoints) => throw new NotSupportedException();
    }

    public sealed class XiaomiCameraDirectoryService;
    public sealed class XiaomiLiveStreamService;
    public sealed class XiaomiHlsService
    {
        public XiaomiHlsService() => throw new NotSupportedException("定向检查不能启动媒体链路。");
        public Task StopAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    public sealed record XiaomiSetupError(string Code, string Message);
    [JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
    [JsonSerializable(typeof(XiaomiSetupError))]
    internal partial class XiaomiHttpJsonContext : JsonSerializerContext;
}

namespace Meowv.Api.Modules.XiaomiCamera.Cloud
{
    public sealed class XiaomiAccountLoginFlow;
}
