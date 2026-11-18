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
using Meowv.Api.Modules.Music.Storage;
using Meowv.Api.Modules.XiaomiCamera;
using Meowv.Api.Security;
using Meowv.Api.Infrastructure;
using Microsoft.Data.Sqlite;

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
            var registered = JsonSerializer.Deserialize(await providers.Content.ReadAsStringAsync(), MusicJsonContext.Default.MusicProviders)!;
            Check(providers.IsSuccessStatusCode && registered.Providers.Select(x => x.Id).SequenceEqual(["netease", "kuwo-search"]),
                "Only the current playback and metadata sources are registered");
            using var retired = await client.GetAsync("/api/music/demo-audio/original-001.mp3");
            Check(retired.StatusCode == HttpStatusCode.NotFound, "Retired demo audio route is absent");
            using var noChart = await client.GetAsync("/api/music/charts/daily");
            Check(noChart.StatusCode == HttpStatusCode.NotFound, "QQ chart is disabled by default");
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
        var chartFixture = new QQChartFixture { PersistSnapshots = true };
        await Case(root, true, async (client, app) =>
        {
            using var anonymous = await client.GetAsync("/api/music/charts/daily");
            await Error(anonymous, 401, "unauthorized");
            Check(chartFixture.Calls == 0, "Anonymous chart request does not contact QQ");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            using var first = await client.GetAsync("/api/music/charts/daily");
            using var page = JsonDocument.Parse(await first.Content.ReadAsStringAsync());
            var result = page.RootElement;
            var entry = result.GetProperty("entries").EnumerateArray().Single();
            Check(first.IsSuccessStatusCode && result.GetProperty("period").GetString() == "2026-11-18" &&
                !result.GetProperty("stale").GetBoolean() && entry.GetProperty("durationMs").GetInt64() == 120000 &&
                entry.GetProperty("trackKey").GetString() == "qq-fixture" && chartFixture.Calls == 1, "QQ metadata and source period are returned");
            using var denied = await client.PostAsync("/api/music/admin/charts/refresh", null);
            Check(denied.StatusCode == HttpStatusCode.Unauthorized && chartFixture.Calls == 1, "Music device cannot force chart refresh");
            using var cached = await client.GetAsync("/api/music/charts/daily");
            using var cachedPage = JsonDocument.Parse(await cached.Content.ReadAsStringAsync());
            Check(cached.IsSuccessStatusCode && chartFixture.Calls == 1 &&
                cachedPage.RootElement.GetProperty("capturedAt").GetString() == result.GetProperty("capturedAt").GetString(),
                "Fresh snapshots keep the same persisted fetch time and avoid another upstream request");
            Check(app.Services.GetRequiredService<MusicChartStore>().Latest("rising", "qqmusic")?
                .Entries.Single().TrackKey == "qq-fixture", "Explicit opt-in persists the chart");

            chartFixture.Clock.Now = chartFixture.Clock.Now.AddMinutes(31);
            chartFixture.Status = HttpStatusCode.TooManyRequests;
            chartFixture.RetryAfter = TimeSpan.FromHours(2);
            client.DefaultRequestHeaders.Add("X-Api-Bootstrap-Token", "YOUR_SYNTHETIC_MANAGEMENT_TOKEN_FOR_TESTS_ONLY");
            using var stale = await client.PostAsync("/api/music/admin/charts/refresh", null);
            using var stalePage = JsonDocument.Parse(await stale.Content.ReadAsStringAsync());
            Check(stale.IsSuccessStatusCode && stalePage.RootElement.GetProperty("stale").GetBoolean() && chartFixture.Calls == 2,
                "Failed admin refresh keeps the previous snapshot marked stale");
            chartFixture.Clock.Now = chartFixture.Clock.Now.AddMinutes(31);
            using var coolingDown = await client.PostAsync("/api/music/admin/charts/refresh", null);
            Check(coolingDown.IsSuccessStatusCode && chartFixture.Calls == 2, "Upstream Retry-After applies to manual refresh too");

            chartFixture.Clock.Now = chartFixture.Clock.Now.AddHours(24);
            chartFixture.Status = HttpStatusCode.OK;
            chartFixture.Body = """{"code":0,"req":{"code":0,"data":{}}}""";
            using var malformed = await client.GetAsync("/api/music/charts/daily");
            using var malformedPage = JsonDocument.Parse(await malformed.Content.ReadAsStringAsync());
            Check(malformed.IsSuccessStatusCode && malformedPage.RootElement.GetProperty("stale").GetBoolean() && chartFixture.Calls == 3,
                "Malformed new chart cannot erase yesterday's snapshot");
        }, change: new("QQChartEnabled", "true"), chart: chartFixture);
        var rankingFixture = new QQChartFixture
        {
            Gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously),
            Body = """
                {"code":0,"req":{"code":0,"data":{
                  "data":{"topId":62,"period":"2026-11-18","updateTime":"2026-11-18","totalNum":3,
                    "song":[{"rank":1,"songId":41},{"rank":2,"songId":42},{"rank":3,"songId":43}]},
                  "songInfoList":[
                    {"id":41,"mid":"wrong-artist","title":"睡醒就好了","interval":100,"singer":[{"name":"Other artist"}]},
                    {"id":42,"mid":"verified-track","title":"睡醒就好了","interval":100,"singer":[{"name":"qix"}]},
                    {"id":43,"mid":"unavailable-track","title":"今天也不错","interval":100,"singer":[{"name":"qix"}]}
                  ]
                }}}
                """
        };
        await Case(root, true, async (client, app) =>
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
            async Task<MusicRecommendationPage> Recommend() =>
                JsonSerializer.Deserialize(await client.GetStringAsync("/api/music/recommendations?limit=1"),
                    MusicJsonContext.Default.MusicRecommendationPage)!;
            var ordinary = await Recommend();
            Check(ordinary.Strategy == "netease_search_candidates", "Ordinary recommendation does not wait for QQ");
            rankingFixture.Gate.SetResult();
            MusicRecommendationPage ranked = ordinary;
            using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            while (!ranked.Strategy.StartsWith("qq_rising_verified_", StringComparison.Ordinal))
            {
                await Task.Delay(25, budget.Token);
                ranked = await Recommend();
            }
            Check(ranked.Items.Length == 1 && ranked.Items[0].Id == ordinary.Items[0].Id &&
                ranked.Items[0].Title == "睡醒就好了" && ranked.NextCursor == ordinary.NextCursor && rankingFixture.Calls == 1,
                "Verified provider track is recommended, replaces its duplicate, and preserves the ordinary continuation");
            var next = JsonSerializer.Deserialize(await client.GetStringAsync("/api/music/recommendations?limit=1&cursor=" +
                Uri.EscapeDataString(ranked.NextCursor!)), MusicJsonContext.Default.MusicRecommendationPage)!;
            Check(next.Strategy == "netease_search_candidates" && next.Items.Single().Id != ranked.Items[0].Id,
                "Follow-up uses the original recommendation cursor");
            // 以较大的首页验证解析失败的同名项没有被标记为榜单候选添加到原结果之外。
            var mixed = JsonSerializer.Deserialize(await client.GetStringAsync("/api/music/recommendations?limit=2"),
                MusicJsonContext.Default.MusicRecommendationPage)!;
            Check(mixed.Items.Select(x => x.Id).Distinct().Count() == 2, "The ranked track does not duplicate an ordinary item");
            var snapshot = await app.Services.GetRequiredService<QQMusicChart>().GetAsync(false, budget.Token);
            var catalog = app.Services.GetRequiredService<MusicCatalog>();
            Check(await catalog.MatchChartEntryAsync(snapshot.Entries[0], budget.Token) is null &&
                  await catalog.MatchChartEntryAsync(snapshot.Entries[2], budget.Token) is null,
                "A different artist or a failed full-audio resolution excludes the entry from ranked recommendations");
            using (var db = app.Services.GetRequiredService<ApiDatabase>().OpenConnection())
            using (var command = db.CreateCommand())
            {
                command.CommandText = "SELECT COUNT(*) FROM sqlite_schema WHERE name='music_chart_snapshots';";
                Check((long)command.ExecuteScalar()! == 0, "Default QQ chart mode does not initialize chart storage");
            }
            using var unavailable = new HttpClient(new QQChartFixture { Status = HttpStatusCode.ServiceUnavailable });
            var restartedChart = new QQMusicChart(unavailable, null, rankingFixture.Clock);
            try
            {
                _ = await restartedChart.GetAsync(false, budget.Token);
                throw new Exception("A new in-memory chart instance must not recover an old offline snapshot");
            }
            catch (MusicException error) when (error.Status == 503) { }

            rankingFixture.Clock.Now = rankingFixture.Clock.Now.AddDays(1);
            var afterMidnight = await Recommend();
            Check(afterMidnight.Strategy == "netease_search_candidates", "Expired chart is ignored immediately across Shanghai midnight");
        }, change: new("QQChartEnabled", "true"), chart: rankingFixture);
        Console.WriteLine("PASS: Music native-source HTTP fixture contracts, QQ chart refresh and stale fallback, scoped access, configuration isolation, bounded concurrency and 429. No external provider/media request.");
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
        CheckChartSnapshots(database, path + ".backup");
        Check(before.SequenceEqual(ExistingState(database)), "Music writes preserve existing Chat, Camera and Auth data and schema");
        Console.WriteLine("PASS: Existing Chat, Camera and Auth database data and schema survive music writes");
    }

    private static void CheckChartSnapshots(ApiDatabase database, string backupPath)
    {
        var now = new DateTimeOffset(2026, 11, 18, 1, 0, 0, TimeSpan.Zero);
        var date = new DateOnly(2026, 11, 18);
        var entries = new[]
        {
            new MusicChartEntry(2, "second", "第二首", ["测试歌手"]),
            new MusicChartEntry(1, "first", "第一首", ["测试歌手"], 125000)
        };
        var seed = new MusicChartSnapshot("weekly", "fixture", date, now, now.AddMinutes(-10),
            now.AddDays(-7), now.AddDays(-1), entries);
        var charts = new MusicChartStore(database);
        Check(charts.Latest("weekly", "fixture") is null && charts.Save(seed), "Empty chart initializes and accepts one snapshot");
        Check(!charts.Save(seed with { BusinessDate = date.AddDays(1), CapturedAt = now.AddDays(1) }),
            "Repeated upstream version does not create another dated snapshot");
        Check(charts.Save(seed with { SourceUpdatedAt = now.AddMinutes(-5), Entries = [entries[0]] }),
            "Newer same-day snapshot replaces every entry");
        Check(!charts.Save(seed with { BusinessDate = date.AddDays(1), CapturedAt = now.AddDays(1) }),
            "An older upstream response cannot replace the chart");
        var latest = new MusicChartStore(database).Latest("weekly", "fixture");
        Check(latest is { Entries.Length: 1 } && latest.Entries[0].Title == "第二首" &&
              latest.CapturedAt == now && latest.SourceUpdatedAt == now.AddMinutes(-5), "Read round-trips metadata and separate timestamps");
        for (var day = 1; day <= 30; day++)
            Check(charts.Save(seed with
            {
                BusinessDate = date.AddDays(day), CapturedAt = now.AddDays(day), SourceUpdatedAt = now.AddDays(day).AddMinutes(-1)
            }), "New daily snapshot can be stored");
        Check(charts.Save(seed with { Source = "other" }), "Retention is isolated by source");

        using (var connection = database.OpenConnection())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT COUNT(*) FROM music_chart_snapshots WHERE source_name='fixture';";
            Check((long)command.ExecuteScalar()! == 30, "Storage retains the latest 30 snapshots for that series");
            command.CommandText = """
                CREATE TRIGGER music_fixture_prune_failure BEFORE DELETE ON music_chart_snapshots
                  WHEN OLD.source_name='fixture' BEGIN SELECT RAISE(ABORT,'fixture prune failure'); END;
                """;
            command.ExecuteNonQuery();
            var failed = false;
            try
            {
                charts.Save(seed with
                {
                    BusinessDate = date.AddDays(31), CapturedAt = now.AddDays(31), SourceUpdatedAt = now.AddDays(31)
                });
            }
            catch (SqliteException error) when (error.SqliteErrorCode == 19) { failed = true; }
            Check(failed && charts.Latest("weekly", "fixture")?.BusinessDate == date.AddDays(30),
                "Failure after insertion rolls back to the preceding snapshot");
            command.CommandText = "DROP TRIGGER music_fixture_prune_failure;";
            command.ExecuteNonQuery();
            using var backup = new ApiDatabase("Data Source=" + backupPath).OpenConnection();
            connection.BackupDatabase(backup);
        }

        var restored = new ApiDatabase("Data Source=" + backupPath);
        var restoredChart = new MusicChartStore(restored).Latest("weekly", "fixture");
        Check(restoredChart?.BusinessDate == date.AddDays(30) && restoredChart.Entries.Select(x => x.Rank).SequenceEqual([1, 2]) &&
              ExistingState(database).SequenceEqual(ExistingState(restored)), "SQLite backup reopens the chart and preserves the other modules");
        Console.WriteLine("PASS: Music chart snapshots are idempotent, bounded, atomic on failure and recoverable from SQLite backup");
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
        bool upstreamUnavailable = false, KeyValuePair<string, string>? change = null, bool production = false,
        QQChartFixture? chart = null)
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
        if (chart?.PersistSnapshots == true) values["Modules:Music:QQChartPersistSnapshots"] = "true";
        builder.Configuration.AddInMemoryCollection(values);
        builder.Logging.ClearProviders();
        builder.Services.AddApiServices(builder.Configuration);
        builder.Services.AddMusicModule(builder.Configuration);
        if (chart is not null)
            builder.Services.AddSingleton<QQMusicChart>(services =>
                new QQMusicChart(new HttpClient(chart), services.GetRequiredService<MusicOptions>().QQChartPersistSnapshots
                    ? services.GetRequiredService<MusicChartStore>() : null, chart.Clock));
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

    private sealed class TestClock : TimeProvider
    {
        public DateTimeOffset Now = new DateTimeOffset(2026, 11, 18, 3, 0, 0, TimeSpan.Zero).AddTicks(17);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class QQChartFixture : HttpMessageHandler
    {
        public TestClock Clock { get; } = new();
        public HttpStatusCode Status = HttpStatusCode.OK;
        public TimeSpan? RetryAfter;
        public int Calls;
        public bool PersistSnapshots;
        public TaskCompletionSource? Gate;
        public string Body = """
            {"code":0,"req":{"code":0,"data":{
              "data":{"topId":62,"period":"2026-11-18","updateTime":"2026-11-18","totalNum":1,"song":[{"rank":1,"songId":42}]},
              "songInfoList":[{"id":42,"mid":"qq-fixture","title":"Fixture","interval":120,"singer":[{"name":"Artist"}]}]
            }}}
            """;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Check(request.Method == HttpMethod.Get && request.RequestUri is { Scheme: "https", Host: "u.y.qq.com" } &&
                !request.Headers.Contains("Authorization") && !request.Headers.Contains("Cookie"),
                "Chart requests use the fixed public QQ host without session credentials");
            Calls++;
            if (Gate is not null) await Gate.Task.WaitAsync(cancellationToken);
            var response = new HttpResponseMessage(Status) { Content = Json(Body) };
            if (RetryAfter is { } delay) response.Headers.RetryAfter = new RetryConditionHeaderValue(delay);
            return response;
        }
    }
}
