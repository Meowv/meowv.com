using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Meowv.Api.Core;
using Meowv.Api.Modules.Diagnostics;
using Meowv.Api.Modules.Health;
using Meowv.Api.Modules.Auth;
using Meowv.Api.Modules.Chat;
using Meowv.Api.Modules.Music;
using Meowv.Api.Modules.Music.Contracts;
using Meowv.Api.Security;
using Meowv.Api.Infrastructure;

internal static class MusicChecks
{
    private const string Token = "YOUR_SYNTHETIC_MUSIC_DEVICE_TOKEN_FOR_TESTS_ONLY";

    public static async Task RunAsync(string root)
    {
        await NeteaseSourceChecks.RunAsync();
        Check(!JsonSerializer.IsReflectionEnabledByDefault, "JSON reflection must stay disabled");
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "music-v1.json")));
        var page = JsonSerializer.Deserialize(fixture.RootElement.GetProperty("search"), MusicJsonContext.Default.MusicSearchPage)!;
        Check(page.Items[0].DurationMs == 12000 && page.Items[0].Sources[0].ProviderId == "original-demo", "Golden DTO fixture");

        await Case(root, true, async (client, app) =>
        {
            using var health = await client.GetAsync("/api/music/health");
            Check(health.StatusCode == HttpStatusCode.OK && (await health.Content.ReadAsStringAsync()).Contains("ready"), "Ready demo health");
            using var unauthorized = await client.PostAsync("/api/music/resolve", new StringContent("{broken", Encoding.UTF8, "application/json"));
            await Error(unauthorized, 401, "unauthorized");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var providers = await client.GetAsync("/api/music/providers");
            Check(providers.IsSuccessStatusCode && !(await providers.Content.ReadAsStringAsync()).Contains("true"), "Fake does not claim full tracks");
            using var search = await client.GetAsync("/api/music/search?q=%E7%9D%A1%E9%86%92&limit=1");
            using var searchJson = JsonDocument.Parse(await search.Content.ReadAsStringAsync());
            Check(search.StatusCode == HttpStatusCode.OK && searchJson.RootElement.GetProperty("items")[0].GetProperty("id").GetString() == "original-001", "Unicode search");
            Check(JsonElement.DeepEquals(searchJson.RootElement, fixture.RootElement.GetProperty("search")), "HTTP matches golden wire fixture");
            using var first = await client.GetAsync("/api/music/recommendations?limit=1");
            using var firstJson = JsonDocument.Parse(await first.Content.ReadAsStringAsync());
            Check(firstJson.RootElement.GetProperty("generatedAt").GetString()!.EndsWith("Z", StringComparison.Ordinal), "UTC wire timestamps use Z");
            var cursor = firstJson.RootElement.GetProperty("nextCursor").GetString()!;
            using var second = await client.GetAsync("/api/music/recommendations?limit=1&cursor=" + Uri.EscapeDataString(cursor));
            using var secondJson = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
            Check(secondJson.RootElement.GetProperty("items")[0].GetProperty("id").GetString() == "original-002" && secondJson.RootElement.GetProperty("nextCursor").ValueKind == JsonValueKind.Null, "Finite catalog cursor exhaustion");
            foreach (var query in new[] { "q=", "q=%00", "q=qix&limit=0", "q=qix&limit=51", "q=qix&limit=bad", "q=qix&limit=1&limit=2", "q=qix&cursor=bad", "q=qix&cursor=" + cursor, "q=" + new string('a', 101) })
            {
                using var bad = await client.GetAsync("/api/music/search?" + query);
                await Error(bad, 400, "invalid_request");
            }
            using var resolve = await client.PostAsync("/api/music/resolve", Json("{\"trackId\":\"original-001\",\"newField\":true}"));
            var resolved = JsonSerializer.Deserialize(await resolve.Content.ReadAsStringAsync(), MusicJsonContext.Default.MusicResolvedTrack)!;
            Check(resolve.IsSuccessStatusCode && resolved.Audio.Seekable && resolved.Audio.DurationMs == 12000 && resolved.Confidence == 1, "Resolve safe fixture");
            using var missing = await client.PostAsync("/api/music/resolve", Json("{\"trackId\":\"https://127.0.0.1/private\"}"));
            await Error(missing, 404, "track_not_found");
            foreach (var body in new[] { "{}", "null", "{broken", "{\"trackId\":2}", "{\"trackId\":\"original-001\",\"quality\":\"lossless\"}", "{\"trackId\":\"" + new string('a', 5000) + "\"}" })
            {
                using var bad = await client.PostAsync("/api/music/resolve", Json(body));
                await Error(bad, 400, "invalid_request");
            }
            using var forbidden = await client.PostAsync("/api/music/resolve", Json("{\"trackId\":\"original-001\",\"preferredProviderId\":\"disabled\"}"));
            await Error(forbidden, 403, "forbidden");
            using var other = await client.GetAsync("/probe/common");
            Check(other.StatusCode == HttpStatusCode.Unauthorized, "Music token must not authorize common API");
            using var admin = await client.PostAsync("/api/auth/access-code", null);
            Check(admin.StatusCode == HttpStatusCode.Unauthorized, "Music token must not authorize management");
            var commonCode = app.Services.GetRequiredService<IAccessCodeService>().CreateIfMissing()!;
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", commonCode);
            using var wrongScope = await client.GetAsync("/api/music/providers");
            await Error(wrongScope, 401, "unauthorized");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var catalog = await client.GetAsync("/api/modules");
            var text = await catalog.Content.ReadAsStringAsync();
            Check(text.Contains("/api/music/resolve") && text.Contains("MusicDevice"), "Catalog exposes music scope");
            var runtime = app.Services.GetRequiredService<MusicRuntime>();
            var leases = new List<IDisposable>();
            for (var i = 0; i < 4; i++) { Check(runtime.TryEnter(out var lease, out _), "Concurrent permit"); leases.Add(lease!); }
            try { Check(!runtime.TryEnter(out _, out var wait) && wait == 1, "Global concurrency bound"); }
            finally { foreach (var lease in leases) lease.Dispose(); }
        });
        await Case(root, false, async (client, _) =>
        {
            using var health = await client.GetAsync("/api/music/health");
            Check((int)health.StatusCode == 503 && (await health.Content.ReadAsStringAsync()).Contains("disabled"), "Disabled health");
            using var route = await client.GetAsync("/api/music/search?q=qix");
            Check(route.StatusCode == HttpStatusCode.NotFound, "Disabled business endpoints absent");
            await CommonHealthy(client);
        });
        await Case(root, true, async (client, _) =>
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var health = await client.GetAsync("/api/music/health");
            Check((await health.Content.ReadAsStringAsync()).Contains("degraded"), "No media is degraded");
            using var resolve = await client.PostAsync("/api/music/resolve", Json("{\"trackId\":\"original-001\"}"));
            await Error(resolve, 503, "source_unavailable");
        }, noAudio: true);
        foreach (var invalid in new Dictionary<string, string>
        {
            ["DemoMode"] = "false", ["TestAccessToken"] = "", ["MaxConcurrentRequests"] = "0", ["RequestsPerMinute"] = "invalid",
            ["DemoAudioUrls:0"] = "http://127.0.0.1/private", ["AllowedMediaHosts:0"] = "untrusted.example.org",
        })
        {
            await Case(root, true, async (client, _) =>
            {
                using var health = await client.GetAsync("/api/music/health");
                Check((int)health.StatusCode == 503 && (await health.Content.ReadAsStringAsync()).Contains("unavailable"), "Invalid Music config isolated");
                await CommonHealthy(client);
            }, change: invalid);
        }
        await Case(root, true, async (client, _) =>
        {
            using var health = await client.GetAsync("/api/music/health");
            Check((int)health.StatusCode == 503, "Production must reject Demo");
        }, production: true);
        await Case(root, true, async (client, _) =>
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var first = await client.GetAsync("/api/music/providers");
            Check(first.IsSuccessStatusCode, "First bounded request");
            client.DefaultRequestHeaders.Add("X-Forwarded-For", "192.0.2.10");
            using var limited = await client.GetAsync("/api/music/providers");
            await Error(limited, 429, "rate_limited");
            Check(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero, "429 Retry-After header");
        }, change: new("RequestsPerMinute", "1"));
        await Case(root, true, async (client, app) =>
        {
            app.Services.GetRequiredService<MusicOptions>().TestAccessToken = "";
            using var denied = await client.PostAsync("/api/music/setup/devices", Json("{broken"));
            Check(denied.StatusCode == HttpStatusCode.Unauthorized, "Management auth precedes body parsing");
            client.DefaultRequestHeaders.Add("X-Api-Bootstrap-Token", "YOUR_SYNTHETIC_MANAGEMENT_TOKEN_FOR_TESTS_ONLY");
            using var issued = await client.PostAsync("/api/music/setup/devices", Json("{\"alias\":\"Test car\"}"));
            Check(issued.StatusCode == HttpStatusCode.Created && issued.Headers.CacheControl?.NoStore == true, "Issue scoped credential without caching");
            using var document = JsonDocument.Parse(await issued.Content.ReadAsStringAsync());
            var id = document.RootElement.GetProperty("id").GetString()!;
            var token = document.RootElement.GetProperty("token").GetString()!;
            var database = app.Services.GetRequiredService<ApiDatabase>();
            var reopened = new MusicDeviceStore(database, TimeProvider.System);
            Check(reopened.Verify(token) == id, "Credential persists across store reconstruction");
            using (var connection = database.OpenConnection())
            using (var query = connection.CreateCommand())
            {
                query.CommandText = "SELECT token_hash FROM music_device_tokens WHERE id=$id;";
                query.Parameters.AddWithValue("$id", id);
                var hash = (string)query.ExecuteScalar()!;
                Check(hash.Length == 64 && hash != token, "Store only digest");
            }
            using var listing = await client.GetAsync("/api/music/setup/devices");
            var text = await listing.Content.ReadAsStringAsync();
            Check(!text.Contains(token) && !text.Contains("tokenHash"), "Listing never exposes credentials");
            client.DefaultRequestHeaders.Remove("X-Api-Bootstrap-Token");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var allowed = await client.GetAsync("/api/music/providers");
            Check(allowed.IsSuccessStatusCode, "Issued device credential authenticates");
            using var common = await client.GetAsync("/probe/common");
            Check(common.StatusCode == HttpStatusCode.Unauthorized, "Device credential is music-only");
            using var manage = await client.GetAsync("/api/music/setup/devices");
            Check(manage.StatusCode == HttpStatusCode.Unauthorized, "Device cannot manage credentials");
            client.DefaultRequestHeaders.Add("X-Api-Bootstrap-Token", "YOUR_SYNTHETIC_MANAGEMENT_TOKEN_FOR_TESTS_ONLY");
            using var revoked = await client.DeleteAsync("/api/music/setup/devices/" + id);
            Check(revoked.StatusCode == HttpStatusCode.NoContent, "Management revokes device");
            Check(reopened.Verify(token) is null, "Revocation survives reconstruction");
            using var expired = await client.GetAsync("/api/music/providers");
            await Error(expired, 401, "unauthorized");
            await CommonHealthy(client);
        }, change: new("DeviceCredentialsEnabled", "true"));
        await Case(root, true, async (client, app) =>
        {
            var db = app.Services.GetRequiredService<ApiDatabase>();
            db.EnsureSchema("music-devices", 99, "CREATE TABLE music_preserved_marker(id INTEGER);");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "mvm_" + new string('A', 43));
            using var failed = await client.GetAsync("/api/music/providers");
            await Error(failed, 503, "source_unavailable");
            await CommonHealthy(client);
        }, change: new("DeviceCredentialsEnabled", "true"));
        await Case(root, true, async (client, _) =>
        {
            using var denied = await client.GetAsync("/api/music/demo-audio/original-001.mp3");
            await Error(denied, 401, "unauthorized");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var resolved = await client.PostAsync("/api/music/resolve", Json("{\"trackId\":\"original-001\"}"));
            using var document = JsonDocument.Parse(await resolved.Content.ReadAsStringAsync());
            Check(document.RootElement.GetProperty("audio").GetProperty("url").GetString() == "http://10.0.2.2:5000/api/music/demo-audio/original-001.mp3", "Local media URL stays on configured endpoint");
            using var request = new HttpRequestMessage(HttpMethod.Get, "/api/music/demo-audio/original-001.mp3");
            request.Headers.Range = new RangeHeaderValue(0, 127);
            using var range = await client.SendAsync(request);
            Check(range.StatusCode == HttpStatusCode.PartialContent && (await range.Content.ReadAsByteArrayAsync()).Length == 128 && range.Content.Headers.ContentType?.MediaType == "audio/mpeg", "Authorized local Range and MIME");
            using var unknown = await client.GetAsync("/api/music/demo-audio/private.db");
            Check(unknown.StatusCode == HttpStatusCode.NotFound, "Never expose arbitrary local files");
        }, localMedia: true);
        await Case(root, true, async (client, _) =>
        {
            using var response = await client.GetAsync("/api/music/health");
            Check(response.StatusCode == HttpStatusCode.ServiceUnavailable, "Local demo media never enables Production");
        }, localMedia: true, production: true);
        await Case(root, true, async (client, _) =>
        {
            using var response = await client.GetAsync("/api/music/health");
            Check(response.StatusCode == HttpStatusCode.ServiceUnavailable, "Invalid local media path is isolated");
            await CommonHealthy(client);
        }, localMedia: true, change: new("DemoMediaDirectory", "\0invalid"));
        Console.WriteLine("PASS: Music Fake HTTP contracts, Unicode/cursors, pre-binding authentication, scoped access, configuration isolation, JSON source generation, bounded concurrency and 429. No external provider/media request.");
    }

    private static async Task CommonHealthy(HttpClient client)
    {
        foreach (var path in new[] { "/api/health", "/api/modules", "/api/docs", "/api/chat/health" })
        { using var response = await client.GetAsync(path); Check(response.IsSuccessStatusCode, "Common route " + path); }
    }

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");
    private static async Task Error(HttpResponseMessage response, int status, string code)
    {
        Check((int)response.StatusCode == status, "Expected " + status + " got " + (int)response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Check(json.RootElement.GetProperty("error").GetProperty("code").GetString() == code, "Expected error " + code);
        Check(response.Headers.CacheControl?.NoStore == true, "Errors must not cache");
    }

    private static void Check(bool condition, string description) { if (!condition) throw new Exception(description); }

    private static async Task Case(string root, bool enabled, Func<HttpClient, WebApplication, Task> run,
        bool noAudio = false, KeyValuePair<string, string>? change = null, bool production = false, bool localMedia = false)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = root, EnvironmentName = production ? "Production" : "Testing" });
        builder.Configuration.Sources.Clear();
        var values = new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = "Data Source=" + Guid.NewGuid().ToString("N") + ".db",
            ["Security:BootstrapToken"] = "YOUR_SYNTHETIC_MANAGEMENT_TOKEN_FOR_TESTS_ONLY",
            ["Modules:Chat:Enabled"] = "true", ["Cors:AllowedOrigins:0"] = "http://localhost:4001",
            ["Modules:Music:Enabled"] = enabled.ToString(), ["Modules:Music:DemoMode"] = "true",
            ["Modules:Music:TestAccessToken"] = Token, ["Modules:Music:AllowedMediaHosts:0"] = "media.example.org",
        };
        if (!noAudio)
        {
            values["Modules:Music:DemoAudioUrls:0"] = "https://media.example.org/original-001.mp3";
            values["Modules:Music:DemoAudioUrls:1"] = "https://media.example.org/original-002.mp3";
        }
        if (localMedia)
        {
            var directory = Path.Combine(root, "music-demo-fixtures");
            Directory.CreateDirectory(directory);
            foreach (var name in new[] { "original-001.mp3", "original-002.mp3" }) File.WriteAllBytes(Path.Combine(directory, name), Enumerable.Range(0, 512).Select(i => (byte)i).ToArray());
            values["Modules:Music:DemoMediaDirectory"] = directory;
            values["Modules:Music:DemoMediaBaseUrl"] = "http://10.0.2.2:5000/api/music/";
        }
        if (change.HasValue) values["Modules:Music:" + change.Value.Key] = change.Value.Value;
        builder.Configuration.AddInMemoryCollection(values);
        builder.Logging.ClearProviders();
        builder.Services.AddApiServices(builder.Configuration);
        builder.Services.AddMusicModule(builder.Configuration);
        builder.Services.AddChatModule(builder.Configuration);
        builder.Services.AddSingleton<IEndpointModule, HealthModule>();
        builder.Services.AddSingleton<IEndpointModule, AuthModule>();
        builder.Services.AddSingleton<IEndpointModule, DiagnosticsModule>();
        await using var app = builder.Build();
        app.Urls.Add("http://127.0.0.1:0");
        app.UseForwardedHeaders(); app.UseRouting(); app.UseCors(); app.UseRateLimiter();
        foreach (var module in app.Services.GetServices<IEndpointModule>())
        {
            module.ConfigureMiddleware(app);
            module.MapEndpoints(app.MapGroup("").WithMetadata(new EndpointModuleMetadata(module.Name)));
        }
        app.UseAuthentication(); app.UseAuthorization();
        app.MapGet("/probe/common", () => "must not execute").RequireAuthorization();
        await app.StartAsync();
        try
        {
            using var client = new HttpClient(new HttpClientHandler { UseProxy = false }) { BaseAddress = new Uri(app.Urls.Single()), Timeout = TimeSpan.FromSeconds(10) };
            await run(client, app);
        }
        finally { await app.StopAsync(); }
    }
}
