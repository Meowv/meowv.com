using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Meowv.Api.Core;
using Meowv.Api.Infrastructure;
using Meowv.Api.Modules.Auth;
using Meowv.Api.Modules.Diagnostics;
using Meowv.Api.Modules.Health;
using Meowv.Api.Security;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;
using Meowv.Api.Modules.XiaomiCamera;
using Meowv.Api.Modules.XiaomiCamera.Cloud;

var root = Path.Combine(Path.GetTempPath(), "meowv-api-check-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
var names = new[] { "DOTNET_ENVIRONMENT", "ASPNETCORE_ENVIRONMENT", "Tools__FFmpeg__Path" };
var saved = names.ToDictionary(name => name, Environment.GetEnvironmentVariable);
var oldDirectory = Environment.CurrentDirectory;
try
{
    const string management = "YOUR_SYNTHETIC_MANAGEMENT_TOKEN_FOR_TESTS_ONLY";
    File.WriteAllText(Path.Combine(root, "appsettings.json"), """
                                                              {"ConnectionStrings":{"DefaultConnection":"Data Source=state folder/api.db"},
                                                               "Security":{"BootstrapToken":""},"Modules":{"XiaomiCamera":{"Enabled":false}},
                                                               "Tools":{"FFmpeg":{"Path":"public"}},"Cors":{"AllowedOrigins":["http://localhost:4001"]}}
                                                              """);
    File.WriteAllText(Path.Combine(root, "appsettings.Development.json"), """
                                                                          {"Security":{"BootstrapToken":"__management__"},"Tools":{"FFmpeg":{"Path":"development"}},
                                                                           "Modules":{"XiaomiCamera":{"Media":{"Profile":"development"}}}}
                                                                          """.Replace("__management__", management));

    void Check(bool condition, string description)
    {
        if (!condition) throw new Exception(description);
    }

    Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", "Development");
    Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
    Environment.CurrentDirectory = Path.GetTempPath();
    var dev = ApiConfiguration.CreateBuilder(["--contentRoot", root]);
    Check(dev.Configuration["Tools:FFmpeg:Path"] == "development", "Development overlay");
    Environment.SetEnvironmentVariable("Tools__FFmpeg__Path", "environment");
    var env = ApiConfiguration.CreateBuilder(["--contentRoot", root]);
    Check(env.Configuration["Tools:FFmpeg:Path"] == "environment", "Environment precedence");
    var cli = ApiConfiguration.CreateBuilder(["--contentRoot", root, "--Tools:FFmpeg:Path", "command"]);
    Check(cli.Configuration["Tools:FFmpeg:Path"] == "command", "Command-line precedence");
    Environment.SetEnvironmentVariable("Tools__FFmpeg__Path", null);
    Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", "Production");
    Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production");
    var production = ApiConfiguration.CreateBuilder(["--contentRoot", root]);
    Check(production.Configuration["Security:BootstrapToken"] == "", "Production must ignore dev secrets");
    Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", "Development");
    Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
    FfmpegPathChecks.Run(root);
    await ModuleInitializationChecks.RunAsync(root);
    var builder = ApiConfiguration.CreateBuilder(["--contentRoot", root]);
    builder.Logging.ClearProviders();
    builder.Services.AddApiServices(builder.Configuration);
    builder.Services.AddXiaomiCameraModule(builder.Configuration);
    builder.Services.AddSingleton<IEndpointModule, AuthModule>();
    builder.Services.AddSingleton<IEndpointModule, DiagnosticsModule>();
    builder.Services.AddSingleton<IEndpointModule, HealthModule>();
    builder.Services.AddSingleton<IEndpointModule, FirstProbeModule>();
    builder.Services.AddSingleton<IEndpointModule, SecondProbeModule>();
    builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.TypeInfoResolverChain.Insert(0, ProbeJsonContext.Default));
    await using var app = builder.Build();
    app.Urls.Add("http://127.0.0.1:0");
    app.Use(async (context, next) =>
    {
        // 模拟绕过本机代理的外部连接，验证客户端不能自行伪造转发身份。
        if (context.Request.Path == "/api/proxy/untrusted")
            context.Connection.RemoteIpAddress = IPAddress.Parse("203.0.113.9");
        await next(context);
    });
    app.UseForwardedHeaders();
    app.UseRouting();
    app.UseCors();
    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseAuthorization();
    foreach (var module in app.Services.GetRequiredService<IEnumerable<IEndpointModule>>())
    {
        module.ConfigureMiddleware(app);
        module.MapEndpoints(app.MapGroup("").WithMetadata(new EndpointModuleMetadata(module.Name)));
    }

    app.MapGet("/api/proxy/{kind}", (HttpContext context) => $"{context.Connection.RemoteIpAddress}|{context.Request.Scheme}");
    using var startupTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
    await app.StartAsync(startupTimeout.Token);
    using var client = new HttpClient(new HttpClientHandler { UseProxy = false }) { BaseAddress = new Uri(app.Urls.Single()), Timeout = TimeSpan.FromSeconds(10) };
    Check((await client.GetAsync("/api/health")).StatusCode == HttpStatusCode.OK, "Anonymous health");
    using (var catalogResponse = await client.GetAsync("/api/modules"))
    {
        Check(catalogResponse.StatusCode == HttpStatusCode.OK && catalogResponse.Headers.CacheControl?.NoStore == true,
            "Module endpoint catalog must be available without stale caching");
        using var catalog = JsonDocument.Parse(await catalogResponse.Content.ReadAsStringAsync());
        var modules = catalog.RootElement.EnumerateArray().ToArray();

        JsonElement FindRoute(string module, string path) => modules.Single(item => item.GetProperty("name").GetString() == module)
            .GetProperty("endpoints").EnumerateArray().Single(item => item.GetProperty("path").GetString() == path);

        Check(!modules.Any(module => module.GetProperty("name").GetString() == "xiaomi-camera"), "Disabled module is absent from catalog");
        Check(FindRoute("health", "/api/health").GetProperty("authorization").GetString() == "匿名", "Anonymous catalog entry");
        Check(FindRoute("auth", "/api/auth/access-code").GetProperty("authorization").GetString() == "管理密钥", "Inherited management policy entry");
        Check(FindRoute("first", "/api/first/probe").GetProperty("authorization").GetString() == "通用授权码", "Default authorization entry");
        Check(FindRoute("first", "/api/first/public").GetProperty("authorization").GetString() == "匿名", "AllowAnonymous overrides standard authorization");
        Check(FindRoute("first", "/api/compat/probe").GetProperty("authorization").GetString() == "通用授权码", "Ownership does not depend on path prefix");
        Check(FindRoute("second", "/api/second/media/{ticket}").GetProperty("authorization").GetString() == "播放票据", "Custom media access is not mislabeled anonymous");
        Check(FindRoute("second", "/api/second/probe").GetProperty("methods")[0].GetString() == "POST", "Catalog contains HTTP methods");
        Check(FindRoute("diagnostics", "/api/docs").GetProperty("methods")[0].GetString() == "GET", "Catalog includes its own page");
    }

    using (var docs = await client.GetAsync("/api/docs"))
        Check(docs.StatusCode == HttpStatusCode.OK && (await docs.Content.ReadAsStringAsync()).Contains("筛选模块"), "Browser-readable endpoint catalog");
    using (var setupPage = await client.GetAsync("/setup"))
    {
        Check(setupPage.StatusCode == HttpStatusCode.OK && setupPage.Headers.CacheControl?.NoStore == true,
            "Unified setup page must be available without caching");
        Check((await setupPage.Content.ReadAsStringAsync()).Contains("接入摄像头"), "Unified setup includes camera initialization");
    }

    async Task<string> ForwardedIdentity(string kind, string forwardedFor)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/proxy/" + kind);
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        request.Headers.Add("X-Forwarded-Proto", "https");
        using var response = await client.SendAsync(request);
        return await response.Content.ReadAsStringAsync();
    }

    Check(await ForwardedIdentity("trusted", "192.0.2.1") == "192.0.2.1|https", "Loopback proxy identity");
    Check(await ForwardedIdentity("trusted", "192.0.2.2") == "192.0.2.2|https", "Distinct forwarded clients");
    Check(await ForwardedIdentity("trusted", "198.51.100.1, 192.0.2.3") == "192.0.2.3|https", "Only the nearest forwarded hop is trusted");
    Check(await ForwardedIdentity("untrusted", "192.0.2.1") == "203.0.113.9|http", "Untrusted peer cannot spoof forwarded identity");

    async Task<HttpStatusCode> AttemptManagement(string forwardedFor)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/access-code");
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        using var response = await client.SendAsync(request);
        return response.StatusCode;
    }

    for (var i = 0; i < 10; i++)
        Check(await AttemptManagement("192.0.2.10") == HttpStatusCode.Unauthorized, "Requests below per-client limit reach authentication");
    Check(await AttemptManagement("192.0.2.10") == HttpStatusCode.TooManyRequests, "Rate limiting returns 429");
    Check(await AttemptManagement("192.0.2.11") == HttpStatusCode.Unauthorized, "Another forwarded client retains its own quota");
    var codes = app.Services.GetRequiredService<IAccessCodeService>();
    var database = app.Services.GetRequiredService<ApiDatabase>();
    Check(codes.GetVersion() == 0, "Fresh install must not import an old code");
    using (var initial = database.OpenConnection())
    using (var command = initial.CreateCommand())
    {
        command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE name = 'xiaomi_camera_state';";
        Check((long)command.ExecuteScalar()! == 0, "Authentication does not create camera storage");
    }

    var unauthorized = await client.GetAsync("/api/first/probe");
    Check(unauthorized.StatusCode == HttpStatusCode.Unauthorized && unauthorized.Headers.WwwAuthenticate.Any(), "Missing code challenge");
    Check((await client.PostAsync("/api/second/probe", new StringContent("invalid JSON", Encoding.UTF8, "application/json"))).StatusCode == HttpStatusCode.Unauthorized,
        "Authenticate before body binding");
    using var invalidAdmin = new HttpRequestMessage(HttpMethod.Post, "/api/auth/access-code");
    invalidAdmin.Headers.Add("X-Api-Bootstrap-Token", "YOUR_SYNTHETIC_INVALID_MANAGEMENT_TOKEN");
    Check((await client.SendAsync(invalidAdmin)).StatusCode == HttpStatusCode.Unauthorized, "Invalid management key rejected");

    async Task<string?> Manage(string suffix)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/access-code" + suffix);
        request.Headers.Add("X-Api-Bootstrap-Token", management);
        var response = await client.SendAsync(request);
        Check(response.StatusCode == HttpStatusCode.OK, "Management request");
        Check(response.Headers.CacheControl?.NoStore == true, "Secret response must not cache");
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("accessCode").GetString();
    }

    var code = await Manage("");
    Check(!string.IsNullOrWhiteSpace(code) && await Manage("") is null, "One-time code display");
    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", code);
    Check((await client.PostAsync("/api/auth/access-code", null)).StatusCode == HttpStatusCode.Unauthorized,
        "Application code cannot replace the management key");
    Check((await client.GetAsync("/api/first/probe")).StatusCode == HttpStatusCode.OK, "First module authorization");
    Check((await client.PostAsync("/api/second/probe", new StringContent("{\"value\":\"ok\"}", Encoding.UTF8, "application/json"))).StatusCode == HttpStatusCode.OK,
        "Same code authorizes second module");
    Check(codes.Verify(code, out var version), "Stored code verification");
    Check(File.Exists(Path.Combine(root, "state folder/api.db")), "Database rooted independently of working directory");
    var fresh = new AccessCodeService(database);
    Check(fresh.Verify(code, out var persistedVersion) && persistedVersion == version, "Code persistence across service reconstruction");
    var paths = app.Services.GetRequiredService<ApiPaths>();
    Check(paths.Resolve(Path.Combine(root, "absolute folder")) == Path.Combine(root, "absolute folder"), "Absolute path");
    var options = new XiaomiCameraOptions(
        Options.Create(new XiaomiModuleOptions { Media = new() { Profile = "development" } }),
        Options.Create(new FfmpegOptions { Path = "missing tool/ffmpeg" }),
        paths);
    Check(options.FfmpegPath == Path.Combine(root, "missing tool/ffmpeg") && options.TempDirectory == Path.GetTempPath(), "Module path normalization");
    try
    {
        _ = new XiaomiFfmpegResolver(options, paths, app.Environment);
        throw new Exception("Explicit missing FFmpeg must not fall back");
    }
    catch (InvalidOperationException)
    {
    }

    var cache = new XiaomiCredentialCache(database);
    var credentials = new XiaomiCloudCredentials("synthetic-user", "synthetic-cuser", Convert.ToBase64String([1, 2, 3]), "SYNTHETIC_SERVICE_TOKEN", "cn");
    cache.Save(credentials);
    Check(cache.TryLoad() == credentials, "Cloud session storage round trip without a data key");
    Check(new XiaomiCredentialCache(database).TryLoad() == credentials, "Cloud session persistence across service reconstruction");
    using var tickets = new XiaomiPlaybackTicketService(cache, codes);
    var target = new XiaomiPlaybackTarget("synthetic-device", cache.GetSessionVersion(), Guid.NewGuid());
    var ticket = tickets.Create(target, version);
    Check(ticket is not null && tickets.TryGetPlayback(ticket, out _), "Ticket creation");
    var rotated = await Manage("/rotate");
    Check(rotated != code && !codes.Verify(code, out _) && codes.Verify(rotated, out _), "Global rotation");
    Check(!tickets.TryGetPlayback(ticket!, out _), "Rotation revokes media tickets");
    Check((await client.GetAsync("/api/first/probe")).StatusCode == HttpStatusCode.Unauthorized, "Old code revoked in first module");
    Check((await client.PostAsync("/api/second/probe", new StringContent("{\"value\":\"ok\"}", Encoding.UTF8, "application/json"))).StatusCode == HttpStatusCode.Unauthorized,
        "Old code revoked in second module");
    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", rotated);
    Check((await client.GetAsync("/api/first/probe")).StatusCode == HttpStatusCode.OK, "New code accepted");
    var newTicket = tickets.Create(target, codes.GetVersion());
    cache.Clear();
    Check(newTicket is not null && !tickets.TryGetPlayback(newTicket, out _), "Camera session revokes only its tickets");
    Check(codes.Verify(rotated, out _), "Camera session changes do not revoke global code");
    cache.Save(credentials);
    using (var connection = database.OpenConnection())
    using (var command = connection.CreateCommand())
    {
        command.CommandText = "UPDATE xiaomi_camera_state SET credentials_json = 'invalid JSON' WHERE id = 1;";
        command.ExecuteNonQuery();
    }

    Check(cache.TryLoad() is null, "Invalid stored cloud session is cleared");
    await app.StopAsync();
    Console.WriteLine("PASS: configuration, module failure isolation, runtime endpoint catalog and authorization labels, trusted proxy identity, per-client rate limits, HTTP authorization, persistence, global rotation, cloud storage and ticket revocation. No full API build or camera calls.");
}
finally
{
    Environment.CurrentDirectory = oldDirectory;
    foreach (var name in names) Environment.SetEnvironmentVariable(name, saved[name]);
    SqliteConnection.ClearAllPools();
    Directory.Delete(root, recursive: true);
}

public sealed record ProbeRequest(string Value);

[JsonSerializable(typeof(ProbeRequest))]
internal partial class ProbeJsonContext : JsonSerializerContext;

internal sealed class FirstProbeModule : IEndpointModule
{
    public string Name => "first";
    public string Description => "First test module";

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/first/probe", () => "first").RequireAuthorization();
        endpoints.MapGet("/api/first/public", () => "public").RequireAuthorization().AllowAnonymous();
        endpoints.MapGet("/api/compat/probe", () => "alias").RequireAuthorization();
    }
}

internal sealed class SecondProbeModule : IEndpointModule
{
    public string Name => "second";
    public string Description => "Second test module";

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/second/probe", (ProbeRequest input) => input.Value).RequireAuthorization();
        endpoints.MapGet("/api/second/media/{ticket}", () => "synthetic")
            .WithMetadata(new EndpointAccessMetadata("播放票据"));
    }
}