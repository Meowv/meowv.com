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
using Meowv.Api.Modules.Music.Providers;
using Meowv.Api.Modules.XiaomiCamera;
using Meowv.Api.Security;
using Meowv.Api.Infrastructure;

internal static class MusicChecks
{
    private const string Token = "YOUR_SYNTHETIC_MUSIC_DEVICE_TOKEN_FOR_TESTS_ONLY";

    public static async Task RunAsync(string root)
    {
        await NeteaseSourceChecks.RunAsync();
        await MusicAggregationChecks.RunAsync();
        CheckExistingDatabase(root);
        Check(!JsonSerializer.IsReflectionEnabledByDefault, "JSON reflection must stay disabled");
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "music-v1.json")));
        var page = JsonSerializer.Deserialize(fixture.RootElement.GetProperty("search"), MusicJsonContext.Default.MusicSearchPage)!;
        Check(page.Items[0].DurationMs == 12000 && page.Items[0].Sources[0].ProviderId == "original-demo", "Golden DTO fixture");

        await Case(root, true, async (client, app) =>
        {
            using var health = await client.GetAsync("/api/music/health");
            Check(health.StatusCode == HttpStatusCode.OK && (await health.Content.ReadAsStringAsync()).Contains("ready"), "Ready source health");
            using var unauthorized = await client.PostAsync("/api/music/resolve", new StringContent("{broken", Encoding.UTF8, "application/json"));
            await Error(unauthorized, 401, "unauthorized");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var providers = await client.GetAsync("/api/music/providers");
            Check(providers.IsSuccessStatusCode && (await providers.Content.ReadAsStringAsync()).Contains("netease"), "Only real source is registered");
            using var retired = await client.GetAsync("/api/music/demo-audio/original-001.mp3");
            Check(retired.StatusCode == HttpStatusCode.NotFound, "Retired demo audio route is absent");
            using var search = await client.GetAsync("/api/music/search?q=%E7%9D%A1%E9%86%92&limit=1");
            using var searchJson = JsonDocument.Parse(await search.Content.ReadAsStringAsync());
            var trackId = searchJson.RootElement.GetProperty("items")[0].GetProperty("id").GetString()!;
            Check(search.StatusCode == HttpStatusCode.OK && trackId.StartsWith("nt-", StringComparison.Ordinal) &&
                searchJson.RootElement.GetProperty("items")[0].GetProperty("title").GetString() == "睡醒就好了", "Unicode search through native source and HTTP fixture");
            using var first = await client.GetAsync("/api/music/recommendations?limit=1");
            using var firstJson = JsonDocument.Parse(await first.Content.ReadAsStringAsync());
            Check(firstJson.RootElement.GetProperty("generatedAt").GetString()!.EndsWith("Z", StringComparison.Ordinal), "UTC wire timestamps use Z");
            var cursor = firstJson.RootElement.GetProperty("nextCursor").GetString()!;
            using var second = await client.GetAsync("/api/music/recommendations?limit=1&cursor=" + Uri.EscapeDataString(cursor));
            using var secondJson = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
            Check(secondJson.RootElement.GetProperty("items")[0].GetProperty("id").GetString() != trackId && secondJson.RootElement.GetProperty("nextCursor").ValueKind == JsonValueKind.Null, "Finite catalog cursor exhaustion");
            foreach (var query in new[] { "q=", "q=%00", "q=qix&limit=0", "q=qix&limit=51", "q=qix&limit=bad", "q=qix&limit=1&limit=2", "q=qix&cursor=bad", "q=qix&cursor=" + cursor, "q=" + new string('a', 101) })
            {
                using var bad = await client.GetAsync("/api/music/search?" + query);
                await Error(bad, 400, "invalid_request");
            }
            using var resolve = await client.PostAsync("/api/music/resolve", Json("{\"trackId\":\"" + trackId + "\",\"newField\":true}"));
            var resolved = JsonSerializer.Deserialize(await resolve.Content.ReadAsStringAsync(), MusicJsonContext.Default.MusicResolvedTrack)!;
            Check(resolve.IsSuccessStatusCode && resolved.Audio.Seekable && resolved.Audio.DurationMs == 100000 && resolved.Confidence == 1, "Native resolve uses isolated upstream HTTP fixture");
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
        await Case(root, true, async (client, app) =>
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var search = await client.GetAsync("/api/music/search?q=Monkeys+Spinning+Monkeys");
            using var json = JsonDocument.Parse(await search.Content.ReadAsStringAsync());
            var item = json.RootElement.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("isrc").GetString() == "USUAN1400011");
            var id = item.GetProperty("id").GetString();
            using var resolved = await client.PostAsync("/api/music/resolve", Json($$"""{"trackId":"{{id}}","preferredProviderId":"incompetech"}"""));
            using var audio = JsonDocument.Parse(await resolved.Content.ReadAsStringAsync());
            Check(resolved.IsSuccessStatusCode && audio.RootElement.GetProperty("providerId").GetString() == "incompetech" &&
                  audio.RootElement.GetProperty("audio").GetProperty("url").GetString() ==
                  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Monkeys%20Spinning%20Monkeys.mp3",
                  "Open recording resolves only to the fixed author host");
            app.Services.GetRequiredService<IConfiguration>()["Modules:Music:IncompetechEnabled"] = "false";
            using var disabled = await client.PostAsync("/api/music/resolve", Json($$"""{"trackId":"{{id}}","preferredProviderId":"incompetech"}"""));
            await Error(disabled, 403, "forbidden");
        }, change: new("IncompetechEnabled", "true"));
        await Case(root, true, async (client, app) =>
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var response = await client.GetAsync("/api/music/search?q=merged&limit=1");
            using var data = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var item = data.RootElement.GetProperty("items")[0];
            Check(item.GetProperty("sources").GetArrayLength() == 2 && item.GetProperty("availability").GetString() == "candidate", "HTTP multi-source merge retains playable source");
            Check(item.GetProperty("sources")[1].GetProperty("confidence").GetDouble() >= .96, "Generated JSON includes match confidence");
            using var noAlternate = await client.PostAsync("/api/music/resolve",
                Json("{\"trackId\":\"" + item.GetProperty("id").GetString() + "\",\"excludedProviderId\":\"netease\"}"));
            await Error(noAlternate, 422, "no_playable_match");
            app.Services.GetRequiredService<IConfiguration>()["Modules:Music:NeteaseEnabled"] = "false";
            using var metadata = await client.GetAsync("/api/music/search?q=metadata");
            using var metadataJson = JsonDocument.Parse(await metadata.Content.ReadAsStringAsync());
            var trackId = metadataJson.RootElement.GetProperty("items")[0].GetProperty("id").GetString();
            Check(metadataJson.RootElement.GetProperty("items")[0].GetProperty("availability").GetString() == "metadata_only", "Only metadata capability remains after switch");
            using var unsupported = await client.PostAsync("/api/music/resolve", Json("{\"trackId\":\"" + trackId + "\"}"));
            await Error(unsupported, 422, "no_playable_match");
            await CommonHealthy(client);
        }, change: new("KuwoSearchEnabled", "true"));
        await Case(root, true, async (client, app) =>
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var failed = await client.GetAsync("/api/music/search?q=outage");
            await Error(failed, 503, "source_unavailable");
            Check(failed.Headers.RetryAfter?.Delta > TimeSpan.Zero, "Source outage carries Retry-After");
            using var health = await client.GetAsync("/api/music/health");
            Check((await health.Content.ReadAsStringAsync()).Contains("degraded"), "Source outage degrades health");
            using var repeated = await client.GetAsync("/api/music/search?q=another");
            await Error(repeated, 503, "source_unavailable");
            Check(app.Services.GetRequiredService<MusicUpstreamFixture>().Count == 1, "Host backoff is shared across requests");
            await CommonHealthy(client);
        }, upstreamUnavailable: true);
        foreach (var invalid in new Dictionary<string, string>
        {
            ["TestAccessToken"] = "", ["MaxConcurrentRequests"] = "0", ["RequestsPerMinute"] = "invalid",
            ["NeteaseRecommendationQuery"] = "\0invalid",
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
            Check(health.IsSuccessStatusCode && (await health.Content.ReadAsStringAsync()).Contains("degraded"), "No enabled sources degrade without breaking host");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var search = await client.GetAsync("/api/music/search?q=test");
            await Error(search, 503, "source_unavailable");
            await CommonHealthy(client);
        }, change: new("NeteaseEnabled", "false"));
        await Case(root, true, async (client, _) =>
        {
            using var health = await client.GetAsync("/api/music/health");
            Check((int)health.StatusCode == 503, "Production must reject development source");
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
        Console.WriteLine("PASS: Music native-source HTTP fixture contracts, Unicode/cursors, pre-binding authentication, scoped access, configuration isolation, JSON source generation, bounded concurrency and 429. No external provider/media request.");
    }

    private static async Task CommonHealthy(HttpClient client)
    {
        foreach (var path in new[] { "/api/health", "/api/modules", "/api/docs", "/api/chat/health" })
        { using var response = await client.GetAsync(path); Check(response.IsSuccessStatusCode, "Common route " + path); }
    }

    private static void CheckExistingDatabase(string root)
    {
        var path = Path.Combine(root, "music-existing-" + Guid.NewGuid().ToString("N") + ".db");
        var database = new ApiDatabase("Data Source=" + path);
        new ChatRepository(database, new ChatOptions()).Initialize();
        _ = new AccessCodeService(database);
        _ = new XiaomiCredentialCache(database);
        using (var connection = database.OpenConnection())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = """
                INSERT INTO chat_messages(guest_id,client_message_id,nickname_snapshot,avatar_seed_snapshot,content,created_at)
                VALUES ('guest','message','fixture','avatar','before music','2026-01-01');
                INSERT INTO auth_state VALUES (1,zeroblob(16),zeroblob(32),7,'2026-01-01');
                INSERT INTO xiaomi_camera_state VALUES (1,'{"fixture":true}','2026-01-01','2026-01-01');
                """;
            command.ExecuteNonQuery();
        }

        var before = ExistingState(database);
        var store = new MusicDeviceStore(database, TimeProvider.System);
        var issued = store.Issue("Database isolation fixture");
        var reopened = new MusicDeviceStore(database, TimeProvider.System);
        Check(reopened.Verify(issued.Token) == issued.Id && reopened.Revoke(issued.Id) &&
              new MusicDeviceStore(database, TimeProvider.System).Verify(issued.Token) is null,
              "Music schema opens idempotently and revocation persists");
        Check(before.SequenceEqual(ExistingState(database)), "Music credential writes preserve existing Chat, Camera and Auth data and schema");
        Console.WriteLine("PASS: Existing Chat, Camera and Auth database data and schema survive music initialization and credential writes");
    }

    private static string[] ExistingState(ApiDatabase database)
    {
        using var connection = database.OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT json_array(name, sql) FROM sqlite_schema
                WHERE tbl_name LIKE 'chat_%' OR tbl_name IN ('auth_state','xiaomi_camera_state')
            UNION ALL
            SELECT json_array(owner, version, applied_at) FROM schema_migrations
                WHERE owner IN ('chat','auth','xiaomi-camera')
            UNION ALL
            SELECT json_array(id,guest_id,client_message_id,nickname_snapshot,avatar_seed_snapshot,content,created_at,deleted_at,revision)
                FROM chat_messages
            UNION ALL
            SELECT json_array(id,hex(access_code_salt),hex(access_code_hash),access_code_version,access_code_updated_at)
                FROM auth_state
            UNION ALL
            SELECT json_array(id,credentials_json,created_at,updated_at) FROM xiaomi_camera_state
            ORDER BY 1;
            """;
        using var reader = command.ExecuteReader();
        var rows = new List<string>();
        while (reader.Read()) rows.Add(reader.GetString(0));
        return rows.ToArray();
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
        bool upstreamUnavailable = false, KeyValuePair<string, string>? change = null, bool production = false)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = root, EnvironmentName = production ? "Production" : "Testing" });
        builder.Configuration.Sources.Clear();
        var values = new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = "Data Source=" + Guid.NewGuid().ToString("N") + ".db",
            ["Security:BootstrapToken"] = "YOUR_SYNTHETIC_MANAGEMENT_TOKEN_FOR_TESTS_ONLY",
            ["Modules:Chat:Enabled"] = "true", ["Cors:AllowedOrigins:0"] = "http://localhost:4001",
            ["Modules:Music:Enabled"] = enabled.ToString(), ["Modules:Music:NeteaseEnabled"] = "true",
            ["Modules:Music:TestAccessToken"] = Token,
        };
        if (change.HasValue) values["Modules:Music:" + change.Value.Key] = change.Value.Value;
        builder.Configuration.AddInMemoryCollection(values);
        builder.Logging.ClearProviders();
        builder.Services.AddApiServices(builder.Configuration);
        builder.Services.AddMusicModule(builder.Configuration);
        builder.Services.AddSingleton(new MusicUpstreamFixture { Status = upstreamUnavailable ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK });
        builder.Services.AddSingleton<NeteaseMusicProvider>(services => new NeteaseMusicProvider(
            new HttpClient(services.GetRequiredService<MusicUpstreamFixture>()), services.GetRequiredService<TimeProvider>()));
        builder.Services.AddSingleton<KuwoSearchProvider>(services => new KuwoSearchProvider(
            new HttpClient(services.GetRequiredService<MusicUpstreamFixture>()), services.GetRequiredService<TimeProvider>()));
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
