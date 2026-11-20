using System.Buffers.Text;
using System.Security.Cryptography;
using System.Net;
using System.Security.Claims;
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
using Meowv.Api.Modules.Music.QQ;
using Meowv.Api.Modules.Music.Storage;
using Meowv.Api.Modules.XiaomiCamera;
using Meowv.Api.Security;
using Meowv.Api.Infrastructure;
using Microsoft.Data.Sqlite;

internal static class MusicChecks
{
    private const string ManagementToken = "YOUR_SYNTHETIC_MANAGEMENT_TOKEN_FOR_TESTS_ONLY";

    public static async Task RunAsync(string root)
    {
        await NeteaseSourceChecks.RunAsync();
        await MusicAggregationChecks.RunAsync();
        string[] styles = ["华语流行", "摇滚", "民谣", "电子", "说唱", "轻音乐", "ACG", "爵士"];
        for (var hour = 0; hour < 24; hour++)
        {
            var boundary = new DateTimeOffset(2026, 11, 19, hour, 0, 0, TimeSpan.FromHours(8));
            Check(MusicCatalog.FallbackQuery(boundary) == styles[hour % 8] &&
                  MusicCatalog.FallbackQuery(boundary.AddSeconds(-1)) == styles[(hour + 7) % 8],
                "Fallback style follows Shanghai hour boundaries");
        }
        Check(MusicCatalog.FallbackQuery(DateTimeOffset.FromUnixTimeSeconds(-1)) == styles[^1], "Negative epoch is floored");
        await SkillChecks(root);
        await QQMembershipChecks(root);
        await RollingCandidatesCheck(root);
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
            UseDevice(client, app);
            using var providers = await client.GetAsync("/api/music/providers");
            var registered = JsonSerializer.Deserialize(await providers.Content.ReadAsStringAsync(), MusicJsonContext.Default.MusicProviders)!;
            Check(providers.IsSuccessStatusCode && registered.Providers.Select(x => x.Id).SequenceEqual(["netease", "qqmusic"]),
                "Only NetEase and QQ Music are registered");
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
            var ids = firstJson.RootElement.GetProperty("items").EnumerateArray()
                .Select(x => x.GetProperty("id").GetString()).ToArray();
            Check(ids.Length > 1 && ids.Distinct().Count() == ids.Length &&
                  firstJson.RootElement.GetProperty("nextCursor").ValueKind == JsonValueKind.Null,
                "Recommendations ignore the old page size and return all distinct tracks in one response");
            foreach (var query in new[] { "q=", "q=%00", "q=qix&limit=0", "q=qix&limit=51", "q=qix&limit=bad", "q=qix&limit=1&limit=2", "q=qix&cursor=bad", "q=" + new string('a', 101) })
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
            UseDevice(client, app);
            using var catalog = await client.GetAsync("/api/modules");
            var text = await catalog.Content.ReadAsStringAsync();
            Check(text.Contains("/api/music/resolve") && text.Contains("MusicDevice"), "Catalog exposes music scope");
            var runtime = app.Services.GetRequiredService<MusicRuntime>();
            var leases = new List<IDisposable>();
            for (var i = 0; i < 4; i++) { Check(runtime.TryEnter("probe", out var lease, out _), "Concurrent permit"); leases.Add(lease!); }
            try { Check(!runtime.TryEnter("probe", out _, out var wait) && wait == 1, "Global concurrency bound"); }
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
            UseDevice(client, app);
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
            ["MaxConcurrentRequests"] = "0", ["RequestsPerMinute"] = "invalid",
        })
        {
            await Case(root, true, async (client, _) =>
            {
                using var health = await client.GetAsync("/api/music/health");
                Check((int)health.StatusCode == 503 && (await health.Content.ReadAsStringAsync()).Contains("unavailable"), "Invalid Music config isolated");
                await CommonHealthy(client);
            }, change: invalid);
        }
        await Case(root, true, async (client, app) =>
        {
            using var health = await client.GetAsync("/api/music/health");
            Check(health.IsSuccessStatusCode && (await health.Content.ReadAsStringAsync()).Contains("ready"), "Production uses the same Music availability rules");
            using var anonymousSetup = await client.GetAsync("/api/music/setup/devices");
            Check(anonymousSetup.StatusCode == HttpStatusCode.Unauthorized, "Production device management stays protected");
            UseDevice(client, app);
            using var providers = await client.GetAsync("/api/music/providers");
            Check(providers.IsSuccessStatusCode, "Production serves Music business endpoints");
        }, production: true);
        await Case(root, true, async (client, app) =>
        {
            UseDevice(client, app);
            using var first = await client.GetAsync("/api/music/providers");
            Check(first.IsSuccessStatusCode, "First bounded request");
            client.DefaultRequestHeaders.Add("X-Forwarded-For", "192.0.2.10");
            using var limited = await client.GetAsync("/api/music/providers");
            await Error(limited, 429, "rate_limited");
            Check(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero, "429 Retry-After header");
        }, change: new("RequestsPerMinute", "1"));
        await ActivationChecks(root);
        await ReactivationAndDeletionChecks(root);
        await ActivationCapacityCheck(root);

        await Case(root, true, async (client, app) =>
        {
            var db = app.Services.GetRequiredService<ApiDatabase>();
            db.EnsureSchema("music-device-activation", 99, "CREATE TABLE music_preserved_marker(id INTEGER);");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "mvm_" + new string('A', 43));
            using var failed = await client.GetAsync("/api/music/providers");
            await Error(failed, 503, "source_unavailable");
            await CommonHealthy(client);
        });
        var qqFallback = new MusicUpstreamFixture { IncludeQqTracks = true, EmptyRecommendations = true };
        await Case(root, true, async (client, app) =>
        {
            var netease = app.Services.GetRequiredService<MusicUpstreamFixture>();
            netease.EmptyRecommendations = true;
            UseDevice(client, app);
            var page = JsonSerializer.Deserialize(await client.GetStringAsync("/api/music/recommendations"),
                MusicJsonContext.Default.MusicRecommendationPage)!;
            Check(netease.LastSearch == "电子" && qqFallback.LastSearch == "电子",
                "Hourly fallback query reaches both search providers");
            Check(page.Strategy == "search_candidates" && page.Partial && page.Items.Length == 3 &&
                  page.Items.Any(x => x.Sources.Length == 2) && page.Items.Any(x => x.Sources is [{ ProviderId: "qqmusic" }]),
                "Fallback recommendation merges both sources, deduplicates recordings, and includes QQ-only tracks");
        }, qq: qqFallback, clock: new TestClock());
        var dailyClock = new TestClock();
        var qq = new MusicUpstreamFixture { IncludeQqTracks = true, Clock = dailyClock };
        await Case(root, true, async (client, app) =>
        {
            using var anonymous = await client.GetAsync("/api/music/charts/daily");
            await Error(anonymous, 401, "unauthorized");
            Check(qq.Count == 0, "Anonymous requests do not refresh the chart");
            UseDevice(client, app);
            using var chart = await client.GetAsync("/api/music/charts/daily");
            var page = JsonSerializer.Deserialize(await chart.Content.ReadAsStringAsync(), MusicChartJsonContext.Default.MusicDailyPage)!;
            var feeds = app.Services.GetRequiredService<MusicDailyFeeds>();
            Check(chart.IsSuccessStatusCode && page.Chart == "daily" && !page.Partial && page.Sources.Length == 7 &&
                  page.Items.Count(x => x.Ranks.Length == 2) == 1,
                "Daily chart combines seven sources and keeps both ranks");
            using var denied = await client.PostAsync("/api/music/admin/charts/refresh", null);
            Check(denied.StatusCode == HttpStatusCode.Unauthorized, "Music device cannot force chart refresh");
            var reread = await feeds.GetDailyAsync(false, CancellationToken.None);
            Check(qq.Count == 4 && page.Sources.SequenceEqual(reread.Sources),
                "Fresh snapshots do not refetch QQ and first read agrees with SQLite precision");
            var beforeForce = qq.Count;
            var forced = await feeds.GetDailyAsync(true, CancellationToken.None);
            Check(qq.Count == beforeForce + 4 && !forced.Partial, "Admin force refresh bypasses the cooldown window");
            var store = app.Services.GetRequiredService<MusicChartStore>();
            Check(store.Latest("rising", "qqmusic")?.Entries.Single().TrackKey == "QQfixture00001" &&
                  store.Latest("rising", "netease") is not null &&
                  store.Latest("netease-hot", "netease")?.Entries.Single().Title == "网易热歌" &&
                  store.Latest("qq-hot", "qqmusic")?.Entries.Single().Title == "QQ热歌" &&
                  store.Latest("qq-new", "qqmusic")?.Entries.Single().Title == "QQ新歌",
                "All default feeds are written to SQLite under isolated chart keys");

            UseDevice(client, app);
            using var recommendations = await client.GetAsync("/api/music/recommendations");
            var recommended = JsonSerializer.Deserialize(await recommendations.Content.ReadAsStringAsync(), MusicJsonContext.Default.MusicRecommendationPage)!;
            Check(recommendations.IsSuccessStatusCode && recommended.Items.Length == 6 && recommended.Strategy == "public_daily_music" &&
                  recommended.Items.Any(x => x.Title == "今天也不错") &&
                  recommended.Items.Any(x => x.Title == "QQ热歌") &&
                  recommended.Items.Any(x => x.Title == "QQ新歌") &&
                  recommended.Items.Any(x => x.Sources.Length == 2) && recommended.Items.Any(x => x.Sources is [{ ProviderId: "qqmusic" }]) &&
                  recommended.Items.All(x => x.Availability == "candidate") &&
                  store.Latest("new-songs", "netease") is not null && store.Latest("new-songs", "qqmusic") is not null,
                "Daily recommendations include all default feeds, stay playable, and are deduplicated");
            var trackId = recommended.Items.Single(x => x.Sources.Length == 2).Id;
            using var lyrics = await client.GetAsync("/api/music/lyrics?trackId=" + trackId + "&providerId=qqmusic");
            var lyric = JsonSerializer.Deserialize(await lyrics.Content.ReadAsStringAsync(), MusicJsonContext.Default.MusicLyrics)!;
            Check(lyrics.IsSuccessStatusCode && lyric.ProviderId == "qqmusic" && lyric.Lrc == "[00:01.00]QQ fixture", "Lyrics follow the specified playback provider");

            using var resolve = await client.PostAsync("/api/music/resolve", Json(
                $$"""{"trackId":"{{trackId}}","preferredProviderId":"qqmusic"}"""));
            var audio = JsonSerializer.Deserialize(await resolve.Content.ReadAsStringAsync(), MusicJsonContext.Default.MusicResolvedTrack)!;
            Check(resolve.IsSuccessStatusCode && audio.Audio.Seekable && audio.ProviderId == "qqmusic", "QQ resolves a full-size, range-capable track");
            qq.RangeLength = 480000;
            using var preview = await client.PostAsync("/api/music/resolve", Json(
                $$"""{"trackId":"{{trackId}}","preferredProviderId":"qqmusic"}"""));
            await Error(preview, 422, "no_playable_match");
            var probes = qq.Count;
            using var cachedPreview = await client.PostAsync("/api/music/resolve", Json(
                $$"""{"trackId":"{{trackId}}","preferredProviderId":"qqmusic"}"""));
            await Error(cachedPreview, 422, "no_playable_match");
            Check(qq.Count == probes, "QQ negative cache suppresses repeated upstream probes");

            dailyClock.Now = dailyClock.Now.AddDays(1);
            qq.Status = HttpStatusCode.TooManyRequests;
            qq.RetryAfter = TimeSpan.FromHours(2);
            var partial = await feeds.GetDailyAsync(false, CancellationToken.None);
            Check(partial.Partial && partial.Sources.Count(x => x.Source == "qqmusic") == 4 &&
                  partial.Sources.Where(x => x.Source == "qqmusic").All(x => x.Stale),
                "After midnight unavailable QQ feeds fall back to yesterday and are marked stale");
            var calls = qq.Count;
            dailyClock.Now = dailyClock.Now.AddMinutes(31);
            await feeds.GetDailyAsync(false, CancellationToken.None);
            Check(qq.Count == calls, "The source Retry-After is respected");
        }, qq: qq, clock: dailyClock);
        Console.WriteLine("PASS: Music native-source HTTP contracts, daily SQLite feeds, lyrics, range validation, stale fallback, and scoped access");
    }

    private static async Task CommonHealthy(HttpClient client)
    {
        foreach (var path in new[] { "/api/health", "/api/modules", "/api/docs", "/api/chat/health" })
        { using var response = await client.GetAsync(path); Check(response.IsSuccessStatusCode, "Common route " + path); }
    }

    private static async Task ActivationChecks(string root)
    {
        var clock = new TestClock();
        await Case(root, true, async (client, app) =>
        {
            const string devicesPath = "/api/music/devices";
            const string setupPath = "/api/music/setup/devices";
            using var key = RSA.Create(2048);
            using var anotherKey = RSA.Create(2048);
            var id = Guid.NewGuid().ToString("N");
            var register = RegisterInput(key, id, "<Test car>");
            var statusPath = devicesPath + "/status/" + id;
            using var registered = await client.PostAsync(devicesPath + "/register", Json(Serialize(register)));
            Check(registered.StatusCode == HttpStatusCode.Accepted && registered.Headers.CacheControl?.NoStore == true,
                "Registration is public and not cached");
            var pending = await ReadStatus(registered);
            Check(pending.Status == "pending" && pending.EncryptedToken is null, "Pending registration has no token");
            using var pendingResponse = await client.GetAsync(statusPath);
            Check((await ReadStatus(pendingResponse)) == pending, "Pending status matches registration");

            var store = app.Services.GetRequiredService<MusicDeviceStore>();
            var deviceId = store.List().Single().DeviceId;
            var adminPath = setupPath + "/" + deviceId;
            using var denied = await client.PostAsync(adminPath + "/activate", null);
            Check(denied.StatusCode == HttpStatusCode.Unauthorized, "Anonymous activation denied");
            using var deniedDelete = await client.DeleteAsync(adminPath);
            Check(deniedDelete.StatusCode == HttpStatusCode.Unauthorized, "Anonymous revocation denied");
            client.DefaultRequestHeaders.Add("X-Api-Bootstrap-Token", ManagementToken);
            using var active = await client.PostAsync(adminPath + "/activate", null);
            Check(active.IsSuccessStatusCode && !(await active.Content.ReadAsStringAsync()).Contains("Token"),
                "Activation never returns a token to management");
            using var repeated = await client.PostAsync(adminPath + "/activate", null);
            Check(repeated.IsSuccessStatusCode, "Activation is idempotent");
            using var listing = await client.GetAsync(setupPath);
            var text = await listing.Content.ReadAsStringAsync();
            Check(!text.Contains("encryptedToken") && !text.Contains("tokenHash") && !text.Contains("publicKey"),
                "Listing never exposes credentials");
            client.DefaultRequestHeaders.Remove("X-Api-Bootstrap-Token");

            using var claimed = await client.GetAsync(statusPath);
            var claimedStatus = await ReadStatus(claimed);
            var token = Decrypt(key, claimedStatus);
            Check(claimedStatus.Status == "active" && claimed.Headers.CacheControl?.NoStore == true, "Only device key can claim token");
            using var identical = await client.PostAsync(devicesPath + "/register", Json(Serialize(register)));
            var identicalStatus = await ReadStatus(identical);
            Check(identicalStatus.Status == "active" && identicalStatus.EncryptedToken is null, "Active registration retry preserves state");
            using var conflict = await client.PostAsync(devicesPath + "/register", Json(Serialize(RegisterInput(anotherKey, id, "Other"))));
            await Error(conflict, 409, "device_key_conflict");
            using var malformed = await client.PostAsync(devicesPath + "/register", Json(Serialize(register with { PublicKey = "bad" })));
            await Error(malformed, 400, "invalid_request");
            using var stillActive = await client.GetAsync(statusPath);
            Check((await ReadStatus(stillActive)) == claimedStatus, "Registration conflict leaves the credential intact");
            using var queryToken = await client.GetAsync("/api/music/providers?access_token=" + token);
            await Error(queryToken, 401, "unauthorized");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var allowed = await client.GetAsync("/api/music/providers");
            Check(allowed.IsSuccessStatusCode, "Claimed device uses protected endpoint");
            using var common = await client.GetAsync("/probe/common");
            Check(common.StatusCode == HttpStatusCode.Unauthorized, "Device credential is music-only");

            client.DefaultRequestHeaders.Add("X-Api-Bootstrap-Token", ManagementToken);
            using var revoked = await client.DeleteAsync(adminPath);
            using var revokedAgain = await client.DeleteAsync(adminPath);
            Check(revoked.StatusCode == HttpStatusCode.NoContent && revokedAgain.StatusCode == HttpStatusCode.NoContent,
                "Revocation is idempotent");
            using var revokedStatus = await client.GetAsync(statusPath);
            Check((await ReadStatus(revokedStatus)).Status == "revoked" && store.Verify(token) is null,
                "Revocation clears credentials");
            using var expired = await client.GetAsync("/api/music/providers");
            await Error(expired, 401, "unauthorized");

            using var registerAgain = await client.PostAsync(devicesPath + "/register", Json(Serialize(register)));
            Check((await ReadStatus(registerAgain)).Status == "revoked", "Registration cannot undo revocation");
            using var rateLimited = await client.PostAsync(devicesPath + "/register", Json(Serialize(register)));
            Check((int)rateLimited.StatusCode == 429, "Anonymous registrations use the dedicated IP quota");

            var unapprovedId = Guid.NewGuid().ToString("N");
            var input = RegisterInput(anotherKey, unapprovedId, "Pending");
            store.Register(input);
            var oldDeviceId = store.List().Single(d => d.InstallationId == unapprovedId).DeviceId;
            clock.Now = clock.Now.AddHours(24);
            using var missing = await client.GetAsync(devicesPath + "/status/" + unapprovedId);
            await Error(missing, 404, "device_not_found");
            Check(store.Activate(oldDeviceId) is null, "Expired pending devices cannot activate");
            store.Register(input);
            Check(store.List().Single(d => d.InstallationId == unapprovedId).DeviceId != oldDeviceId &&
                  store.Activate(oldDeviceId) is null, "Management cannot activate replacement through an old ID");
        }, clock: clock);
        Console.WriteLine("PASS: Music registration, device claims, isolation, expiry and revocation");

        static async Task<MusicDeviceStatus> ReadStatus(HttpResponseMessage response) =>
            JsonSerializer.Deserialize(await response.Content.ReadAsStringAsync(), MusicJsonContext.Default.MusicDeviceStatus)!;
        static string Serialize(MusicDeviceRegister input) => JsonSerializer.Serialize(input, MusicJsonContext.Default.MusicDeviceRegister);
    }

    private static async Task ReactivationAndDeletionChecks(string root)
    {
        await Case(root, true, async (client, app) =>
        {
            var devices = app.Services.GetRequiredService<MusicDeviceStore>();
            var membership = app.Services.GetRequiredService<QQSessionStore>();
            using var key = RSA.Create(2048);
            var installationId = Guid.NewGuid().ToString("N");
            var input = RegisterInput(key, installationId, "Test car");
            var initial = devices.Register(input);
            var id = devices.List().Single().DeviceId;
            var adminPath = "/api/music/setup/devices/" + id;
            var deletePath = adminPath + "/record";
            var statusPath = "/api/music/devices/status/" + installationId;
            using var anonymous = await client.DeleteAsync(deletePath);
            Check(anonymous.StatusCode == HttpStatusCode.Unauthorized, "Anonymous record deletion denied");

            client.DefaultRequestHeaders.Add("X-Api-Bootstrap-Token", ManagementToken);
            using var pendingDeletion = await client.DeleteAsync(deletePath);
            await Error(pendingDeletion, 409, "device_not_revoked");
            devices.Activate(id);
            var oldToken = Decrypt(key, devices.Status(installationId)!);
            Check(membership.SetDevice(id, true) && membership.Allowed(id), "Initial grant for the active device");
            using var activeDeletion = await client.DeleteAsync(deletePath);
            await Error(activeDeletion, 409, "device_not_revoked");
            devices.Revoke(id);
            Check(devices.Verify(oldToken) is null && !membership.Allowed(id), "Revocation disables both permissions");

            using var reactivated = await client.PostAsync(adminPath + "/activate", null);
            Check(reactivated.IsSuccessStatusCode, "Management can reactivate the same device");
            var active = devices.Status(installationId)!;
            var newToken = Decrypt(key, active);
            Check(active.ShortCode == initial.ShortCode && oldToken != newToken &&
                  devices.Verify(oldToken) is null && devices.Verify(newToken) == id,
                "Reactivation preserves same identity, replaces the token and leaves the previous token invalid");
            Check(!membership.Allowed(id), "Reactivated devices require a fresh QQ grant");
            Check(membership.SetDevice(id, true), "QQ can be granted again");
            devices.Revoke(id);

            using var deleted = await client.DeleteAsync(deletePath);
            Check(deleted.StatusCode == HttpStatusCode.NoContent && devices.List().Length == 0,
                "Deletion removes the revoked device");
            using var absent = await client.PostAsync(adminPath + "/activate", null);
            Check(absent.StatusCode == HttpStatusCode.NotFound, "Deleted devices cannot be reactivated");
            using var removed = await client.GetAsync(statusPath);
            await Error(removed, 410, "device_removed");
            using var registeredAgain = await client.PostAsync("/api/music/devices/register",
                Json(JsonSerializer.Serialize(input, MusicJsonContext.Default.MusicDeviceRegister)));
            await Error(registeredAgain, 410, "device_removed");

            var database = app.Services.GetRequiredService<ApiDatabase>();
            using var connection = database.OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT COUNT(*) FROM music_qq_devices WHERE device_id=$id;";
            command.Parameters.AddWithValue("$id", id);
            Check(command.ExecuteScalar() is 0L, "Deletion removes the old QQ grant");
            var newInstallation = input with { InstallationId = Guid.NewGuid().ToString("N") };
            Check(devices.Register(newInstallation).Status == "pending", "A new installation can register after deletion");
        });
        Console.WriteLine("PASS: Music reactivation, credential replacement and permanent record deletion");
    }

    private static async Task ActivationCapacityCheck(string root)
    {
        var database = new ApiDatabase("Data Source=" + Path.Combine(root, Guid.NewGuid().ToString("N") + ".db"));
        var clock = new TestClock();
        var devices = new MusicDeviceStore(database, clock);
        devices.Initialize();
        using var key = RSA.Create(2048);
        using var secondKey = RSA.Create(2048);
        var first = RegisterInput(key, Guid.NewGuid().ToString("N"), "First");
        var second = RegisterInput(secondKey, Guid.NewGuid().ToString("N"), "Second");
        devices.Register(first);
        devices.Register(second);
        using (var connection = database.OpenConnection())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = """
                WITH RECURSIVE records(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM records WHERE n<255)
                INSERT INTO music_device_activation(installation_id,device_id,short_code,public_key,model,os_version,status,created_at)
                SELECT lower(hex(randomblob(16))),lower(hex(randomblob(16))),'fixture',X'00','Fixture','9','active',$now FROM records;
                """;
            command.Parameters.AddWithValue("$now", clock.Now.UtcDateTime.ToString("O"));
            command.ExecuteNonQuery();
        }

        var candidates = devices.List().Where(d => d.Status == "pending").ToArray();
        var outcomes = await Task.WhenAll(candidates.Select(d => Task.Run(() => TryActivate(d.DeviceId))));
        Check(outcomes.Count(result => result == "active") == 1 &&
              outcomes.Count(result => result == "device_limit_reached") == 1,
            "Concurrent activation cannot exceed 256 active devices");
        var winner = candidates[Array.IndexOf(outcomes, "active")];
        var waiting = candidates.Single(d => d.DeviceId != winner.DeviceId);
        var ciphertext = devices.Status(winner.InstallationId)!.EncryptedToken;
        Check(TryActivate(winner.DeviceId) == "active" && devices.Status(winner.InstallationId)!.EncryptedToken == ciphertext,
            "Activation is idempotent at capacity");
        Check(devices.Revoke(winner.DeviceId) && TryActivate(waiting.DeviceId) == "active",
            "Revocation makes capacity available");

        string TryActivate(string deviceId)
        {
            try { return devices.Activate(deviceId)!.Status; }
            catch (MusicException error) { return error.Code; }
        }
    }

    private static void UseDevice(HttpClient client, WebApplication app)
    {
        var issued = IssueDevice(app.Services.GetRequiredService<MusicDeviceStore>(), "Test device");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", issued.Token);
    }

    private static (string Id, string Token) IssueDevice(MusicDeviceStore store, string model)
    {
        using var key = RSA.Create(2048);
        var id = Guid.NewGuid().ToString("N");
        store.Register(RegisterInput(key, id, model));
        var device = store.List().Single(d => d.InstallationId == id);
        var active = store.Activate(device.DeviceId)!;
        return (active.DeviceId, Decrypt(key, store.Status(id)!));
    }

    private static MusicDeviceRegister RegisterInput(RSA key, string id, string model) =>
        new(id, Base64Url.EncodeToString(key.ExportSubjectPublicKeyInfo()), model, "9");

    private static string Decrypt(RSA key, MusicDeviceStatus status) =>
        Encoding.ASCII.GetString(key.Decrypt(Base64Url.DecodeFromChars(status.EncryptedToken!), RSAEncryptionPadding.OaepSHA1));

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

        var oldToken = "mvm_" + Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        var oldId = Guid.NewGuid().ToString("N");
        using (var connection = database.OpenConnection())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = """
                CREATE TABLE music_device_tokens(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL);
                INSERT INTO music_device_tokens(id,token_hash) VALUES($id,$hash);
                """;
            command.Parameters.AddWithValue("$id", oldId);
            command.Parameters.AddWithValue("$hash", Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(oldToken))));
            command.ExecuteNonQuery();
        }
        var before = ExistingState(database);
        var store = new MusicDeviceStore(database, TimeProvider.System);
        var issued = IssueDevice(store, "Database isolation fixture");
        var reopened = new MusicDeviceStore(database, TimeProvider.System);
        Check(reopened.Verify(issued.Token) == issued.Id && reopened.Revoke(issued.Id) &&
              new MusicDeviceStore(database, TimeProvider.System).Verify(issued.Token) is null,
              "Music schema opens idempotently and revocation persists");
        var replacement = IssueDevice(new MusicDeviceStore(database, TimeProvider.System), "Database isolation replacement");
        Check(replacement.Id != issued.Id && reopened.Verify(oldToken) is null,
            "New registrations do not accept legacy tokens");
        var oldGrants = new QQSessionStore(database, new MusicOptions());
        _ = oldGrants.Devices();
        using (var connection = database.OpenConnection())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "INSERT INTO music_qq_devices(device_id) VALUES($id);";
            command.Parameters.AddWithValue("$id", oldId);
            command.ExecuteNonQuery();
        }
        Check(oldGrants.Devices().Length == 0 && !oldGrants.Allowed(oldId) && !oldGrants.SetDevice(oldId, true),
            "Legacy device grants are isolated from current QQ membership");
        using (var connection = database.OpenConnection())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT COUNT(*) FROM music_device_tokens WHERE id=$id;";
            command.Parameters.AddWithValue("$id", oldId);
            Check(command.ExecuteScalar() is 1L, "Legacy records remain intact");
        }
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
            Check((long)command.ExecuteScalar()! == 1, "Storage retains the latest snapshot for that series");
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
        MusicUpstreamFixture? qq = null, TestClock? clock = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = root, EnvironmentName = production ? "Production" : "Testing" });
        builder.Configuration.Sources.Clear();
        var values = new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = "Data Source=" + Guid.NewGuid().ToString("N") + ".db",
            ["Security:BootstrapToken"] = ManagementToken,
            ["Modules:Chat:Enabled"] = "true", ["Cors:AllowedOrigins:0"] = "http://localhost:4001",
            ["Modules:Music:Enabled"] = enabled.ToString(),
        };
        if (change.HasValue) values["Modules:Music:" + change.Value.Key] = change.Value.Value;
        builder.Configuration.AddInMemoryCollection(values);
        builder.Logging.ClearProviders();
        builder.Services.AddApiServices(builder.Configuration);
        builder.Services.AddMusicModule(builder.Configuration);
        if (clock is not null) builder.Services.AddSingleton<TimeProvider>(clock);
        var upstream = new MusicUpstreamFixture
        {
            Status = upstreamUnavailable ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK,
            Clock = clock ?? TimeProvider.System
        };
        builder.Services.AddSingleton(upstream);
        builder.Services.AddSingleton<NeteaseMusicProvider>(services => new NeteaseMusicProvider(
            new HttpClient(upstream), services.GetRequiredService<TimeProvider>()));
        builder.Services.AddSingleton<QQMusicProvider>(services => new QQMusicProvider(
            new HttpClient(qq ?? new MusicUpstreamFixture { Status = upstream.Status }), services.GetRequiredService<TimeProvider>()));
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

    private static async Task RollingCandidatesCheck(string root)
    {
        var clock = new TestClock();
        var upstream = new MusicUpstreamFixture { IncludeQqTracks = true, Clock = clock };
        await Case(root, true, async (client, app) =>
        {
            const string path = "/api/music/recommendations/candidates";
            using (var unauthorized = await client.GetAsync(path)) await Error(unauthorized, 401, "unauthorized");
            UseDevice(client, app);
            var pool = app.Services.GetRequiredService<MusicCandidatePool>();
            var store = app.Services.GetRequiredService<MusicCandidateStore>();
            var configured = app.Services.GetRequiredService<MusicOptions>();
            configured.QQMusicSkillApiKey = "qmk-synthetic-fixture";
            using (var legacyRadio = await client.GetAsync("/api/music/recommendations/radio"))
            {
                var radio = JsonSerializer.Deserialize(await legacyRadio.Content.ReadAsStringAsync(),
                    MusicJsonContext.Default.MusicRecommendationPage)!;
                Check(radio.Items.Length == 0, "Legacy fallback cannot read private recommendations without an active grant");
            }
            configured.QQMusicSkillApiKey = "";

            await pool.RefreshAsync(clock.Now, default);
            var firstDay = store.Read();
            Check(firstDay.Items.Length >= 4 && firstDay.Items.Any(x => x.Sources.Length == 2),
                "Public chart and search candidates persist grouped by recording");
            var firstPage = await pool.ReadAsync("fixture-owner", 1, null, null, default);
            Check(firstPage.Items.Length == 1 && firstPage.NextCursor is not null, "First rolling page has a continuation");
            try
            {
                await pool.ReadAsync("fixture-other", 1, firstPage.NextCursor, null, default);
                throw new Exception("Candidate cursor was accepted for another device");
            }
            catch (MusicException error) when (error.Code == "candidate_cursor_expired") { }

            clock.Now = clock.Now.AddMinutes(15);
            await pool.RefreshAsync(clock.Now, default);
            Check(store.Read().Refreshed == firstDay.Refreshed, "At most one persisted refresh per 30 minutes");
            upstream.ExtraDiscovery = 8;
            clock.Now = clock.Now.AddDays(1);
            await pool.RefreshAsync(clock.Now, default);
            using var newPage = await client.GetAsync(path);
            var fresh = JsonSerializer.Deserialize(await newPage.Content.ReadAsStringAsync(),
                MusicJsonContext.Default.MusicRecommendationPage)!;
            var newTracks = fresh.Items.Where(track => track.Id.StartsWith("qq-QQdiscover", StringComparison.Ordinal)).ToArray();
            Check(newTracks.Length == 8 && fresh.DiscoveryTrackIds is { } discovered &&
                  newTracks.All(track => discovered.Contains(track.Id)), "Unchanged charts still gain eight playable discovery items");

            var stableFirst = await pool.ReadAsync("stable-device", 1, null, null, default);
            var existing = store.Read();
            store.Write(existing with { Items = existing.Items.Reverse().ToArray() });
            var stableNext = await pool.ReadAsync("stable-device", 1, stableFirst.NextCursor, null, default);
            Check(stableNext.Items.Length == 1 && stableNext.Items[0].Id != stableFirst.Items[0].Id,
                "Published cursors keep the batch order when SQLite is refreshed");

            var options = app.Services.GetRequiredService<MusicOptions>();
            using var qqClient = new HttpClient(upstream);
            var qq = new QQMusicProvider(qqClient, clock);
            var netease = app.Services.GetRequiredService<NeteaseMusicProvider>();
            var registry = new MusicProviderRegistry(options, [qq, netease]);
            var catalog = new MusicCatalog(registry, clock);
            using var restored = new MusicCandidatePool(options, app.Services.GetRequiredService<MusicRuntime>(), store,
                app.Services.GetRequiredService<MusicDailyFeeds>(), catalog, registry, qq, netease,
                app.Services.GetRequiredService<QQMusicSkill>(), clock,
                Microsoft.Extensions.Logging.Abstractions.NullLogger<MusicCandidatePool>.Instance);
            foreach (var track in newTracks)
            {
                restored.Restore(track.Id);
                var audio = await catalog.ResolveAsync(new MusicResolveRequest(track.Id, "qqmusic"), default);
                Check(audio.Audio.DurationMs == 100000 && audio.Audio.Seekable, "Stored discovery resolves without an in-memory source index");
            }

            var seed = newTracks[0];
            var oversize = Enumerable.Range(1, 151).Select(index =>
            {
                var id = "fixture-cap-" + index;
                var source = new MusicCandidateSource(seed with { Id = id, Title = id,
                    Sources = [new MusicSource("qqmusic", id)] });
                return new MusicCandidate([source], clock.Now, clock.Now, true);
            }).ToArray();
            store.Write(store.Read() with { Items = oversize });
            clock.Now = clock.Now.AddHours(1);
            await pool.RefreshAsync(clock.Now, default);
            Check(store.Read().Items.Length == 150, "Candidate pool is bounded");
            clock.Now = clock.Now.AddDays(8);
            upstream.Status = HttpStatusCode.TooManyRequests;
            await pool.RefreshAsync(clock.Now, default);
            Check(store.Read().Items.All(item => item.Seen > clock.Now.AddDays(-7) &&
                  item.Sources.All(source => !source.Track.Id.StartsWith("fixture-cap-", StringComparison.Ordinal))),
                "Expired items are pruned while rate-limited sources degrade");
        }, change: new("RollingRecommendationsEnabled", "true"), qq: upstream, clock: clock);
    }

    private static async Task QQMembershipChecks(string root)
    {
        var database = new ApiDatabase("Data Source=" + Path.Combine(root, Guid.NewGuid().ToString("N") + ".db"));
        var clock = new TestClock();
        // 固定合成值用于验证密文格式与跨实例恢复。
        var options = new MusicOptions { QQMusicMemberEnabled = true, QQMusicSessionKey = Convert.ToBase64String(new byte[32]) };
        var devices = new MusicDeviceStore(database, clock);
        using var pendingKey = RSA.Create(2048);
        devices.Register(RegisterInput(pendingKey, Guid.NewGuid().ToString("N"), "待审批"));
        var pendingId = devices.List().Single(d => d.Status == "pending").DeviceId;
        var owner = IssueDevice(devices, "测试车机");
        var other = IssueDevice(devices, "未授权设备");
        var store = new QQSessionStore(database, options);
        var fixture = new QQMemberFixture();
        using var http = new HttpClient(fixture);
        var client = new QQAccountClient(http, clock);
        var session = new QQAccountClient.Credential(123, "SYNTHETIC_QQ_SESSION", 2, clock.Now.AddHours(2));
        store.Save(session);
        Check(!store.SetDevice(pendingId, true) && !store.Allowed(other.Id), "Only active devices can be explicitly granted");
        Check(store.SetDevice(owner.Id, true), "Device is explicitly granted");
        using (var connection = database.OpenConnection())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT sealed_credential FROM music_qq_session;";
            var value = (byte[])command.ExecuteScalar()!;
            Check(value[0] == 1 && !Encoding.UTF8.GetString(value).Contains(session.MusicKey, StringComparison.Ordinal),
                "Persisted QQ session is encrypted");
        }
        using var lifetime = new TestLifetime();
        var member = new QQMembership(new QQSessionStore(database, options), client, options, devices, clock, lifetime);
        Check(member.Status().Status == "connected" && member.Status().Devices.SequenceEqual([owner.Id]),
            "Fresh service restores the session and grant");

        static HttpContext Context(string id) => new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id)], "test"))
        };
        Check(member.ForDevice(Context(other.Id)) is null, "Other signed devices cannot use the QQ session");
        var access = member.ForDevice(Context(owner.Id))!;
        const string paid = "fixturePaid001";
        const string denied = "fixturePaid002";
        var tracks = new[] { new QQAccountClient.Mp3(paid, "fixtureMedia01", 3200000), new QQAccountClient.Mp3(denied, "fixtureMedia02", 3200000) };
        var allowed = await access.CheckAsync(tracks, default);
        Check(allowed.SetEquals([paid]), "Per-track upstream authorization excludes denied songs");
        Check((await access.CheckAsync(tracks, default)).SetEquals([paid]) && fixture.StreamCalls == 1,
            "Per-session cache reuses the entitlement decision");
        Check(await access.ResolveAsync(tracks[0], default) is not null, "Player receives a matching whole MP3");
        fixture.ShortRange = true;
        Check(await access.ResolveAsync(tracks[0], default) is null, "CDN preview is rejected by exact Range total");

        Check(devices.Revoke(owner.Id) && !access.Current && await access.ResolveAsync(tracks[0], default) is null,
            "Revocation invalidates existing access and prevents issuance");
        Check(store.SetDevice(other.Id, true), "Another device can be explicitly granted");
        fixture.Expired = true;
        Check(await member.ForDevice(Context(other.Id))!.ResolveAsync(tracks[0], default) is null &&
              member.Status().Status == "expired" && store.Load() is null, "Explicit upstream expiry clears the saved credential");
    }

    private sealed class TestLifetime : IHostApplicationLifetime, IDisposable
    {
        private readonly CancellationTokenSource _stopping = new();
        public CancellationToken ApplicationStarted => CancellationToken.None;
        public CancellationToken ApplicationStopping => _stopping.Token;
        public CancellationToken ApplicationStopped => CancellationToken.None;
        public void StopApplication() => _stopping.Cancel();
        public void Dispose() => _stopping.Dispose();
    }

    private sealed class QQMemberFixture : HttpMessageHandler
    {
        public int StreamCalls { get; private set; }
        public bool ShortRange { get; set; }
        public bool Expired { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (request.Method == HttpMethod.Get)
            {
                var response = new HttpResponseMessage(HttpStatusCode.PartialContent) { Content = new ByteArrayContent([0]) };
                response.Content.Headers.ContentRange = new ContentRangeHeaderValue(0, 0, ShortRange ? 300000 : 3200000);
                return response;
            }

            StreamCalls++;
            using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            var payload = json.RootElement;
            Check(payload.GetProperty("comm").GetProperty("authst").GetString() == "SYNTHETIC_QQ_SESSION",
                "Authenticated stream request is sent to the fixed upstream");
            var requestRows = payload.GetProperty("req_0").GetProperty("param").GetProperty("songmid");
            const string success = """{"songmid":"fixturePaid001","result":0,"purl":"M500fixtureMedia01.mp3?fixture=yes"}""";
            const string denied = """{"songmid":"fixturePaid002","result":104003,"purl":""}""";
            var rows = requestRows.GetArrayLength() == 1 ? success : success + "," + denied;
            var body = Expired ? """{"code":0,"req_0":{"code":104401,"data":{}}}""" :
                """{"code":0,"req_0":{"code":0,"data":{"expiration":180,"midurlinfo":[""" + rows + "]}}}";
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }

    private static async Task SkillChecks(string root)
    {
        var clock = new TestClock();
        var options = new MusicOptions { Enabled = true, QQMusicSkillApiKey = "qmk-synthetic-fixture" };
        var gateway = new SkillFixture();
        using var skillHttp = new HttpClient(gateway);
        using var qqHttp = new HttpClient(new MusicUpstreamFixture { IncludeQqTracks = true });
        var qq = new QQMusicProvider(qqHttp, clock);
        var catalog = new MusicCatalog(new MusicProviderRegistry(options, [qq]), clock);
        var database = new ApiDatabase("Data Source=" + Path.Combine(root, Guid.NewGuid().ToString("N") + ".db"));
        var store = new MusicChartStore(database);
        var skill = new QQMusicSkill(skillHttp, options, clock, store);
        var publicItems = (await qq.SearchAsync("fixture", 10, null, default)).Items;
        var page = await skill.PersonalizeAsync(publicItems, qq, catalog, default);
        Check(page.Length == publicItems.Length && page[0].Sources[0].SourceTrackId == "QQfixture00002",
            "Official daily results reorder QQ candidates by exact MID");
        var restarted = new QQMusicSkill(skillHttp, options, clock, new MusicChartStore(database));
        Check((await restarted.PersonalizeAsync(publicItems, qq, catalog, default)).SequenceEqual(page) &&
              gateway.Calls == 1, "Daily recommendation is restored from SQLite after restart and never calls radio");
        var radio = await restarted.RadioAsync(qq, default);
        Check(radio.Single().Sources[0].SourceTrackId == "QQfixture00001" && gateway.Calls == 2,
            "Explicit queue fallback requests radio separately");
        using (var connection = database.OpenConnection())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT COUNT(*) FROM music_chart_snapshots;";
            Check((long)command.ExecuteScalar()! == 1, "Only the daily recommendation is persisted");
        }
        clock.Now = clock.Now.AddDays(1);
        await restarted.PersonalizeAsync(publicItems, qq, catalog, default);
        Check(gateway.Calls == 3, "Shanghai date rollover requests a new daily recommendation");
        gateway.LimitRadio = true;
        for (var attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                await restarted.RadioAsync(qq, default);
                throw new InvalidOperationException("Expected QQ radio rate limit");
            }
            catch (MusicException error)
            {
                Check(error.Status == 429 && error.RetryAfterSeconds == 27, "Radio propagates HTTP 429 and cached Retry-After");
            }
        }
        Check(gateway.Calls == 4, "Radio cooldown avoids another upstream request");
        options.QQMusicSkillApiKey = "";
        Check((await skill.PersonalizeAsync(publicItems, qq, catalog, default)).SequenceEqual(publicItems) &&
              gateway.Calls == 4, "Missing key preserves public feed without contacting the official gateway");
    }

    private sealed class SkillFixture : HttpMessageHandler
    {
        private int _calls;
        public int Calls => _calls;
        public bool LimitRadio { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref _calls);
            Check(request.Method == HttpMethod.Post && request.RequestUri?.Host == "a.y.qq.com" &&
                  request.Headers.Authorization is { Scheme: "Bearer", Parameter: "qmk-synthetic-fixture" },
                "Official skill uses the configured key on its gateway only");
            using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            Check(json.RootElement.GetProperty("comm").GetProperty("skill_version").GetString() == "0.0.3",
                "Official skill includes its protocol version");
            if (LimitRadio && request.RequestUri!.AbsolutePath == "/discover/radio")
            {
                var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
                response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(27));
                return response;
            }
            var body = request.RequestUri!.AbsolutePath switch
            {
                "/discover/daily-mix" => """{"ret":0,"songlist":[{"songMid":"QQfixture00002","songName":"第二首","singerName":"歌手"}]}""",
                "/discover/radio" => """{"ret":0,"songlist":[{"songMid":"QQfixture00001","songName":"第一首","singerName":"歌手"}]}""",
                _ => throw new InvalidOperationException("Unexpected official endpoint")
            };
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) };
        }
    }

    private sealed class TestClock : TimeProvider
    {
        public DateTimeOffset Now = new DateTimeOffset(2026, 11, 18, 3, 0, 0, TimeSpan.Zero).AddTicks(17);
        public override DateTimeOffset GetUtcNow() => Now;
    }

}
