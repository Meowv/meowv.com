using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Meowv.Api.Core;
using Meowv.Api.Infrastructure;
using Meowv.Api.Modules.Chat;
using Meowv.Api.Modules.Health;
using Meowv.Api.Security;
using Microsoft.Extensions.Options;

var root = Path.Combine(Path.GetTempPath(), "meowv-chat-data-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
const string origin = "http://localhost:4001";
const string management = "YOUR_SYNTHETIC_CHAT_MANAGEMENT_TOKEN_FOR_TESTS";
var configuration = new Dictionary<string, string?>
{
    ["ConnectionStrings:DefaultConnection"] = "Data Source=chat-tests.db",
    ["Security:BootstrapToken"] = management,
    ["Modules:Chat:Enabled"] = "true",
    ["Cors:AllowedOrigins:0"] = origin,
    ["Modules:Chat:SendCooldownMs"] = "1",
    ["Modules:Chat:MaxConnectionsPerGuest"] = "2",
    ["Modules:Chat:SessionsPerWindow"] = "20",
};
void Check(bool condition, string description)
{
    if (!condition) throw new Exception(description);
    Console.WriteLine("PASS " + description);
}
async Task<WebApplication> Start(Dictionary<string, string?> config)
{
    var builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = root, EnvironmentName = "Development" });
    builder.Configuration.Sources.Clear();
    builder.Configuration.AddInMemoryCollection(config);
    builder.Logging.ClearProviders();
    builder.Services.AddApiServices(builder.Configuration);
    builder.Services.AddChatModule(builder.Configuration);
    builder.Services.AddSingleton<IEndpointModule, HealthModule>();
    await Task.CompletedTask;
    var app = builder.Build();
    app.Urls.Add("http://127.0.0.1:0");
    app.UseRouting(); app.UseCors(); app.UseRateLimiter();
    foreach (var module in app.Services.GetRequiredService<IEnumerable<IEndpointModule>>())
    {
        module.ConfigureMiddleware(app);
        module.MapEndpoints(app.MapGroup("").WithMetadata(new EndpointModuleMetadata(module.Name)));
    }
    app.UseAuthentication(); app.UseAuthorization();
    await app.StartAsync();
    if (config["Modules:Chat:Enabled"] == "true")
        for (var i = 0; i < 100 && !app.Services.GetRequiredService<ChatRuntime>().Ready; i++) await Task.Delay(10);
    return app;
}
(HttpClient Client, CookieContainer Cookies) Client(WebApplication app)
{
    var cookies = new CookieContainer();
    var client = new HttpClient(new HttpClientHandler { UseProxy = false, CookieContainer = cookies }) { BaseAddress = new Uri(app.Urls.Single()), Timeout = TimeSpan.FromSeconds(10) };
    client.DefaultRequestHeaders.Add("Origin", origin);
    client.DefaultRequestHeaders.Add("X-Chat-Request", "1");
    return (client, cookies);
}
async Task<JsonElement> Json(HttpResponseMessage response)
{
    using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
    return document.RootElement.Clone();
}
Task<HttpResponseMessage> Post(HttpClient client, string path, string json) => client.PostAsync(path, new StringContent(json, Encoding.UTF8, "application/json"));
string Quote(string value) => JsonSerializer.Serialize(value, ChatJsonContext.Default.String);
async Task<ClientWebSocket> Socket(WebApplication app, CookieContainer cookies, string source = origin)
{
    var socket = new ClientWebSocket();
    socket.Options.Cookies = cookies;
    socket.Options.SetRequestHeader("Origin", source);
    socket.Options.Proxy = null;
    var uri = new UriBuilder(app.Urls.Single()) { Scheme = "ws", Path = "/api/chat/hub" }.Uri;
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    await socket.ConnectAsync(uri, timeout.Token);
    await Write(socket, "{\"protocol\":\"json\",\"version\":1}");
    return socket;
}
Task Write(ClientWebSocket socket, string message) => socket.SendAsync(Encoding.UTF8.GetBytes(message + "\u001e"), WebSocketMessageType.Text, true, CancellationToken.None);
var buffers = new Dictionary<ClientWebSocket, string>();
async Task<JsonElement> Frame(ClientWebSocket socket, Func<JsonElement, bool> predicate)
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    var pending = buffers.GetValueOrDefault(socket, "");
    while (true)
    {
        var separator = pending.IndexOf('\u001e');
        if (separator >= 0)
        {
            var frame = pending[..separator];
            pending = pending[(separator + 1)..];
            using var parsed = JsonDocument.Parse(frame);
            if (predicate(parsed.RootElement)) { buffers[socket] = pending; return parsed.RootElement.Clone(); }
            continue;
        }
        var bytes = new byte[32768];
        var result = await socket.ReceiveAsync(bytes, timeout.Token);
        if (result.MessageType == WebSocketMessageType.Close) throw new Exception("Socket closed unexpectedly");
        pending += Encoding.UTF8.GetString(bytes, 0, result.Count);
    }
}
bool Event(JsonElement frame, string name) => frame.TryGetProperty("target", out var target) && target.GetString() == name;
async Task<JsonElement> Invoke(ClientWebSocket socket, string invocation, string clientId, string content, string? replyToId = null, ChatMentionRequest[]? mentions = null)
{
    await Write(socket, "{\"type\":1,\"invocationId\":" + Quote(invocation) + ",\"target\":\"SendMessage\",\"arguments\":[" + Quote(clientId) + "," + Quote(content) + "," + (replyToId is null ? "null" : Quote(replyToId)) + "," + JsonSerializer.Serialize(mentions ?? [], ChatJsonContext.Default.ChatMentionRequestArray) + "]}");
    return await Frame(socket, frame => frame.TryGetProperty("invocationId", out var value) && value.GetString() == invocation);
}

await using (var app = await Start(configuration))
{
    var accessCodes = app.Services.GetRequiredService<IAccessCodeService>();
    var accessCode = accessCodes.CreateIfMissing()!;
    var (client, cookies) = Client(app);
    using var disposeClient = client;
    Check((await client.GetAsync("/api/health")).IsSuccessStatusCode, "Host health remains available");
    Check((await client.GetAsync("/api/chat/messages")).StatusCode == HttpStatusCode.Unauthorized, "Anonymous history rejected before binding");
    using (var blocked = new HttpClient { BaseAddress = client.BaseAddress })
        Check((await Post(blocked, "/api/chat/session", "{\"nickname\":\"visitor\"}")).StatusCode == HttpStatusCode.Forbidden, "Missing Origin and CSRF header rejected");
    Check((await Post(client, "/api/chat/session", "{\"nickname\":\"a\"}")).StatusCode == HttpStatusCode.BadRequest, "Invalid nickname rejected");
    var joined = await Post(client, "/api/chat/session", "{\"nickname\":\"  测试访客👩‍💻  \"}");
    Check(joined.StatusCode == HttpStatusCode.Created, "Anonymous session created");
    var session = await Json(joined);
    var guestId = session.GetProperty("guest").GetProperty("id").GetString()!;
    Check(session.GetProperty("guest").GetProperty("nickname").GetString() == "测试访客👩‍💻", "Unicode nickname normalized");
    var setCookie = joined.Headers.GetValues("Set-Cookie").Single();
    Check(setCookie.Contains("httponly", StringComparison.OrdinalIgnoreCase) && setCookie.Contains("samesite=strict", StringComparison.OrdinalIgnoreCase) && setCookie.Contains("path=/api/chat"), "HttpOnly Strict scoped cookie");
    Check((await Post(client, "/api/chat/session", "{\"nickname\":\"another\"}")).StatusCode == HttpStatusCode.OK, "Existing session reused");
    using var first = await Socket(app, cookies);
    await Frame(first, frame => !frame.EnumerateObject().Any());
    using var second = await Socket(app, cookies);
    await Frame(second, frame => !frame.EnumerateObject().Any());
    Check((await Json(await client.GetAsync("/api/chat/status"))).GetProperty("onlineUsers").GetInt32() == 1, "Multiple tabs count as one guest");
    using (var third = await Socket(app, cookies))
    {
        var rejection = await Frame(third, frame => frame.TryGetProperty("type", out var type) && type.GetInt32() == 7);
        Check(rejection.TryGetProperty("error", out _), "Per-guest connection limit enforced");
    }
    var (otherClient, otherCookies) = Client(app);
    using var disposeOtherClient = otherClient;
    var otherSession = await Json(await Post(otherClient, "/api/chat/session", "{\"nickname\":\"另一位访客\"}"));
    Check(otherSession.GetProperty("guest").GetProperty("id").GetString() != guestId, "Different browser receives independent server identity");
    using var otherSocket = await Socket(app, otherCookies);
    await Frame(otherSocket, frame => !frame.EnumerateObject().Any());
    Check((await Json(await client.GetAsync("/api/chat/status"))).GetProperty("onlineUsers").GetInt32() == 2, "Different guests count separately");

    var noCookies = new CookieContainer();
    try { using var invalid = await Socket(app, noCookies); Check(false, "Anonymous WebSocket rejected"); }
    catch (WebSocketException) { Check(true, "Anonymous WebSocket rejected"); }
    try { using var invalid = await Socket(app, cookies, "https://untrusted.example"); Check(false, "Untrusted WebSocket Origin rejected"); }
    catch (WebSocketException) { Check(true, "Untrusted WebSocket Origin rejected"); }
    var clientId = Guid.NewGuid().ToString();
    var ack = await Invoke(first, "1", clientId, "<script>alert(1)</script>\n你好");
    Check(ack.TryGetProperty("result", out var result), "SignalR binding and source-generated acknowledgement");
    var messageId = result.GetProperty("id").GetString()!;
    var broadcast = await Frame(second, frame => Event(frame, "message.created"));
    Check(broadcast.GetProperty("arguments")[0].GetProperty("guestId").GetString() == guestId, "Server-supplied sender identity and broadcast");
    var duplicate = await Invoke(first, "2", clientId, "different content");
    Check(duplicate.GetProperty("result").GetProperty("id").GetString() == messageId, "Same client ID returns original acknowledgement");
    var page = await Json(await client.GetAsync("/api/chat/messages"));
    Check(page.GetProperty("items").GetArrayLength() == 1 && page.GetProperty("items")[0].GetProperty("content").GetString()!.StartsWith("<script>"), "Message persisted once as plain text");
    Check((await client.GetAsync("/api/chat/messages?beforeId=1&afterId=2")).StatusCode == HttpStatusCode.BadRequest, "Conflicting cursors rejected");
    Check((await client.GetAsync("/api/chat/messages?limit=101")).StatusCode == HttpStatusCode.BadRequest, "Page size bounded");
    Check((await client.GetAsync("/api/chat/messages?beforeId=99999999999999999999999999")).StatusCode == HttpStatusCode.BadRequest, "Overflow cursor rejected");
    var longContent = await Invoke(first, "3", Guid.NewGuid().ToString(), new string('a', 501));
    Check(longContent.GetProperty("error").GetString()!.Contains("invalid_message"), "Hub rejects oversized messages");
    Check((await client.DeleteAsync($"/api/chat/admin/messages/{messageId}")).StatusCode == HttpStatusCode.Unauthorized, "Guest cannot delete messages");
    Check((await client.GetAsync("/api/chat/admin/session")).StatusCode == HttpStatusCode.Unauthorized, "Management verification rejects anonymous guest");
    Check((await Post(client, $"/api/chat/admin/messages/{messageId}/restore", "{}")).StatusCode == HttpStatusCode.Unauthorized, "Guest cannot restore messages");
    client.DefaultRequestHeaders.Add("Authorization", "Bearer YOUR_INVALID_SYNTHETIC_ACCESS_CODE");
    Check((await client.GetAsync("/api/chat/admin/session")).StatusCode == HttpStatusCode.Unauthorized, "Management verification rejects invalid access code");
    client.DefaultRequestHeaders.Remove("Authorization");
    client.DefaultRequestHeaders.Add("X-Api-Bootstrap-Token", management);
    Check((await client.GetAsync("/api/chat/admin/session")).StatusCode == HttpStatusCode.Unauthorized, "Bootstrap token does not grant Chat management");
    client.DefaultRequestHeaders.Remove("X-Api-Bootstrap-Token");
    client.DefaultRequestHeaders.Add("Authorization", "Bearer " + accessCode);
    var verified = await client.GetAsync("/api/chat/admin/session");
    Check(verified.StatusCode == HttpStatusCode.NoContent && verified.Headers.CacheControl?.NoStore == true, "Management verification accepts access code without caching");
    Check((await client.DeleteAsync($"/api/chat/admin/messages/{messageId}")).StatusCode == HttpStatusCode.NoContent, "Management deletes message");
    var removed = await Frame(second, frame => Event(frame, "message.deleted"));
    Check(removed.GetProperty("arguments")[0].GetProperty("id").GetString() == messageId, "Deletion broadcast delivered");
    var deletedPage = await Json(await client.GetAsync("/api/chat/messages"));
    Check(deletedPage.GetProperty("items")[0].GetProperty("deleted").GetBoolean() && deletedPage.GetProperty("items")[0].GetProperty("content").GetString() == "", "Marked content hidden from history");
    var repository = app.Services.GetRequiredService<ChatRepository>();
    var database = app.Services.GetRequiredService<ApiDatabase>();
    using (var sql = database.OpenConnection())
    using (var command = sql.CreateCommand())
    {
        command.CommandText = "SELECT content FROM chat_messages WHERE id=$id";
        command.Parameters.AddWithValue("$id", messageId);
        Check(((string)command.ExecuteScalar()!).StartsWith("<script>"), "Marked deletion preserves database content");
    }
    var restoredResponse = await Post(client, $"/api/chat/admin/messages/{messageId}/restore", "{}");
    var restored = await Json(restoredResponse);
    Check(restoredResponse.StatusCode == HttpStatusCode.OK && !restored.GetProperty("deleted").GetBoolean() && restored.GetProperty("content").GetString()!.StartsWith("<script>") && restored.GetProperty("revision").GetInt32() == 2, "Restoration returns preserved original content and new revision");
    var restoredEvent = await Frame(second, frame => Event(frame, "message.restored"));
    Check(restoredEvent.GetProperty("arguments")[0].GetProperty("id").GetString() == messageId, "Restoration broadcast delivered");
    Check((await Json(await client.GetAsync("/api/chat/messages"))).GetProperty("items")[0].GetProperty("content").GetString()!.StartsWith("<script>"), "Restored content visible in history");
    Check((await client.DeleteAsync($"/api/chat/admin/messages/{messageId}")).StatusCode == HttpStatusCode.NoContent, "Restored message can be marked again without reason");
    await Frame(second, frame => Event(frame, "message.deleted"));
    Check((await client.DeleteAsync($"/api/chat/admin/messages/{messageId}?permanent=true")).StatusCode == HttpStatusCode.NoContent, "Marked message can be physically deleted");
    var purged = await Frame(second, frame => Event(frame, "message.deleted"));
    Check(purged.GetProperty("arguments")[0].GetProperty("permanent").GetBoolean(), "Physical deletion broadcast distinguished");
    using (var sql = database.OpenConnection())
    using (var command = sql.CreateCommand())
    {
        command.CommandText = "SELECT COUNT(*) FROM chat_messages WHERE id=$id";
        command.Parameters.AddWithValue("$id", messageId);
        Check((long)command.ExecuteScalar()! == 0, "Physical deletion removes database row");
    }
    Check(repository.History(null, null, 30).Items.Length == 0, "Physically deleted message absent from history");
    Check((await Post(client, $"/api/chat/admin/messages/{messageId}/restore", "{}")).StatusCode == HttpStatusCode.NotFound, "Physically deleted message cannot be restored");
    var fixture = repository.CreateSession("synthetic-retention-fixture", "清理测试");
    var fixtureMessage = repository.Insert(fixture, Guid.NewGuid().ToString(), "retention test");
    Check((await client.DeleteAsync($"/api/chat/admin/messages/{fixtureMessage.Id}?permanent=invalid")).StatusCode == HttpStatusCode.BadRequest, "Invalid deletion mode rejected");
    accessCodes.Rotate();
    Check((await Post(client, $"/api/chat/admin/messages/{fixtureMessage.Id}/restore", "{}")).StatusCode == HttpStatusCode.Unauthorized, "Rotated access code cannot restore messages");
    Check((await client.DeleteAsync($"/api/chat/admin/messages/{fixtureMessage.Id}?permanent=true")).StatusCode == HttpStatusCode.Unauthorized, "Rotated access code cannot delete messages");
    Check((await client.DeleteAsync("/api/chat/session")).StatusCode == HttpStatusCode.NoContent, "Logout revokes sender session");
    Check((await client.GetAsync("/api/chat/session")).StatusCode == HttpStatusCode.Unauthorized, "Logged-out session rejected");
    var history = repository.History(null, null, 30);
    Check(history.Items.Length == 1, "History survives session logout");
    var options = app.Services.GetRequiredService<ChatOptions>();
    using (var sql = database.OpenConnection())
    using (var command = sql.CreateCommand())
    {
        command.CommandText = "UPDATE chat_messages SET created_at='2000-01-01T00:00:00.0000000+00:00'; UPDATE chat_guest_sessions SET expires_at='2000-01-01T00:00:00.0000000+00:00';";
        command.ExecuteNonQuery();
    }
    Check(!options.MessageCleanupEnabled, "Message cleanup disabled by default");
    Check(repository.History(null, null, 30).Items.Length == 1, "Disabled cleanup keeps old history visible");
    repository.Cleanup();
    Check(repository.History(null, null, 30).Items.Length == 1, "Disabled cleanup preserves stored old messages");
    options.MessageCleanupEnabled = true;
    options.RetentionDays = 3;
    using (var sql = database.OpenConnection())
    using (var command = sql.CreateCommand())
    {
        command.CommandText = "UPDATE chat_messages SET created_at=$time";
        command.Parameters.AddWithValue("$time", DateTimeOffset.UtcNow.AddDays(-10).ToString("O"));
        command.ExecuteNonQuery();
    }
    Check(repository.History(null, null, 30).Items.Length == 0, "Configured retention enforced before cleanup");
    options.RetentionDays = 30;
    Check(repository.History(null, null, 30).Items.Length == 1, "Configured longer retention includes old history");
    options.RetentionDays = 3;
    var expired = await Invoke(otherSocket, "expired", Guid.NewGuid().ToString(), "expired session");
    Check(expired.GetProperty("error").GetString()!.Contains("session_expired"), "Established Hub rejects expired session");
    Check(repository.Cleanup() >= 1, "Enabled cleanup deletes expired messages");
    options.MessageCleanupEnabled = false;
    Check(repository.History(null, null, 30).Items.Length == 0, "Expired message physically removed");
    var persistedSession = repository.CreateSession("synthetic-persistence-hash", "持久化访客");
    for (var index = 0; index < 65; index++) repository.Insert(persistedSession, Guid.NewGuid().ToString(), "message " + index);
    var latest = repository.History(null, null, 30);
    Check(latest.Items.Length == 30 && latest.HasMore, "Initial history returns latest 30 messages");
    var previous = repository.History(long.Parse(latest.NextCursor!), null, 30);
    var oldest = repository.History(long.Parse(previous.NextCursor!), null, 30);
    Check(previous.Items.Length == 30 && oldest.Items.Length == 5 && !oldest.HasMore && previous.Items.All(item => long.Parse(item.Id) < long.Parse(latest.Items[0].Id)), "Before cursor preserves ascending pages without overlaps");
    var catchup = repository.History(null, long.Parse(oldest.Items[^1].Id), 30);
    Check(catchup.Items.Length == 30 && catchup.HasMore && catchup.NextCursor == catchup.Items[^1].Id, "After cursor supports multi-page recovery");
    Check((await client.DeleteAsync("/api/chat/session")).StatusCode == HttpStatusCode.NoContent, "Logout clears revoked session cookie");

    // 直接验证默认发送窗口和 IP 总量，不依赖长时间等待。
    var limiter = new ChatSendLimiter(new ChatOptions { SendCooldownMs = 2000 });
    limiter.Check("guest", "ip");
    try { limiter.Check("guest", "ip"); Check(false, "Guest cooldown enforced"); }
    catch (ChatException error) { Check(error.Status == 429, "Guest cooldown enforced"); }
    var ipLimiter = new ChatSendLimiter(new ChatOptions { IpMessagesPerMinute = 1 });
    ipLimiter.Check("one", "ip");
    try { ipLimiter.Check("two", "ip"); Check(false, "IP message quota enforced"); }
    catch (ChatException error) { Check(error.Status == 429, "IP message quota enforced"); }
    await app.StopAsync();
}

await using (var restarted = await Start(configuration))
{
    Check(restarted.Services.GetRequiredService<ChatRepository>().History(null, null, 100).Items.Length == 65, "Host restart preserves committed messages");
    var (fresh, _) = Client(restarted);
    using var disposeFresh = fresh;
    Check((await Post(fresh, "/api/chat/session", "{\"nickname\":\"重启访客\"}")).StatusCode == HttpStatusCode.Created, "Session creation survives host restart");
    Check((await fresh.DeleteAsync("/api/chat/session")).StatusCode == HttpStatusCode.NoContent && (await fresh.GetAsync("/api/chat/session")).StatusCode == HttpStatusCode.Unauthorized, "Logout revokes active session");
    await restarted.StopAsync();
}

var replyConfiguration = new Dictionary<string, string?>(configuration) { ["ConnectionStrings:DefaultConnection"] = "Data Source=chat-replies.db" };
await using (var app = await Start(replyConfiguration))
{
    var repository = app.Services.GetRequiredService<ChatRepository>();
    var author = repository.CreateSession("synthetic-reply-author", "引用作者");
    var originals = Enumerable.Range(1, 100).Select(index => repository.Insert(author, Guid.NewGuid().ToString(), "原文 " + index)).ToArray();
    var original = originals[4];
    var (client, cookies) = Client(app);
    using var disposeClient = client;
    Check((await client.GetAsync($"/api/chat/messages/{original.Id}/context")).StatusCode == HttpStatusCode.Unauthorized, "Context requires guest session");
    await Post(client, "/api/chat/session", "{\"nickname\":\"引用访客\"}");
    using var socket = await Socket(app, cookies);
    await Frame(socket, frame => !frame.EnumerateObject().Any());
    var clientId = Guid.NewGuid().ToString();
    var result = (await Invoke(socket, "reply", clientId, "这是一条回复", original.Id)).GetProperty("result");
    var replyId = result.GetProperty("id").GetString()!;
    Check(result.GetProperty("reply").GetProperty("nickname").GetString() == "引用作者" && result.GetProperty("reply").GetProperty("content").GetString() == "原文 5", "Reply preview resolved by server");
    Check((await Invoke(socket, "reply-retry", clientId, "different", originals[5].Id)).GetProperty("result").GetProperty("id").GetString() == replyId, "Reply retry remains idempotent");
    Check((await Invoke(socket, "bad-reply", Guid.NewGuid().ToString(), "test", "999999999")).GetProperty("error").GetString()!.Contains("invalid_reply"), "Missing reply target rejected");
    var context = await Json(await client.GetAsync($"/api/chat/messages/{original.Id}/context"));
    Check(context.GetProperty("items").EnumerateArray().Any(item => item.GetProperty("id").GetString() == original.Id) && context.GetProperty("hasMoreAfter").GetBoolean() && context.GetProperty("items").GetArrayLength() <= 31, "Context locates old message with bounded neighborhood");
    repository.DeleteMessage(original.Id, false);
    Check(repository.Message(replyId)!.Reply is { Deleted: true, Content: "" }, "Marked original hides quoted text");
    Check((await Invoke(socket, "deleted-reply", Guid.NewGuid().ToString(), "test", original.Id)).GetProperty("error").GetString()!.Contains("invalid_reply"), "Deleted reply target rejected");
    repository.RestoreMessage(original.Id);
    Check(repository.Message(replyId)!.Reply is { Deleted: false, Content: "原文 5", Revision: 2 }, "Restored original restores quote");
    repository.DeleteMessage(replyId, false);
    Check(repository.Message(replyId) is { Content: "", Reply: null }, "Deleted reply hides its own quote");
    repository.RestoreMessage(replyId);
    var options = app.Services.GetRequiredService<ChatOptions>();
    using (var sql = app.Services.GetRequiredService<ApiDatabase>().OpenConnection())
    using (var command = sql.CreateCommand())
    {
        command.CommandText = "UPDATE chat_messages SET created_at='2000-01-01T00:00:00.0000000+00:00' WHERE id=$id";
        command.Parameters.AddWithValue("$id", original.Id);
        command.ExecuteNonQuery();
    }
    options.MessageCleanupEnabled = true;
    Check(repository.Message(replyId)!.Reply is { Unavailable: true, Content: "", Nickname: "" } && (await client.GetAsync($"/api/chat/messages/{original.Id}/context")).StatusCode == HttpStatusCode.NotFound, "Expired original does not leak through quote or context");
    options.MessageCleanupEnabled = false;
    repository.DeleteMessage(original.Id, true);
    Check(repository.Message(replyId)!.Reply is { Unavailable: true, Content: "" } && repository.Message(replyId)!.Content == "这是一条回复", "Purged original leaves reply intact without quoted content");
    await app.StopAsync();
}

var mentionConfiguration = new Dictionary<string, string?>(configuration) { ["ConnectionStrings:DefaultConnection"] = "Data Source=chat-mentions.db" };
await using (var app = await Start(mentionConfiguration))
{
    var repository = app.Services.GetRequiredService<ChatRepository>();
    var offline = repository.CreateSession("synthetic-mentioned-offline", "同名访客");
    repository.Insert(offline, Guid.NewGuid().ToString(), "近期消息");
    var (recipient, recipientCookies) = Client(app);
    using var disposeRecipient = recipient;
    var recipientSession = await Json(await Post(recipient, "/api/chat/session", "{\"nickname\":\"同名访客\"}"));
    var recipientId = recipientSession.GetProperty("guest").GetProperty("id").GetString()!;
    using var receiving = await Socket(app, recipientCookies);
    await Frame(receiving, frame => !frame.EnumerateObject().Any());
    var (sender, senderCookies) = Client(app);
    using var disposeSender = sender;
    Check((await sender.GetAsync("/api/chat/participants")).StatusCode == HttpStatusCode.Unauthorized, "Mention candidates require guest authentication");
    var senderSession = await Json(await Post(sender, "/api/chat/session", "{\"nickname\":\"发送者\"}"));
    var senderId = senderSession.GetProperty("guest").GetProperty("id").GetString()!;
    using var sending = await Socket(app, senderCookies);
    await Frame(sending, frame => !frame.EnumerateObject().Any());
    var candidates = await Json(await sender.GetAsync("/api/chat/participants"));
    Check(candidates.EnumerateArray().Any(guest => guest.GetProperty("id").GetString() == recipientId && guest.GetProperty("online").GetBoolean()) && candidates.EnumerateArray().Any(guest => guest.GetProperty("id").GetString() == offline.Guest.Id && !guest.GetProperty("online").GetBoolean()), "Online and recent same-name candidates remain distinct");
    var clientId = Guid.NewGuid().ToString();
    var text = "😀 @同名访客 你好";
    ChatMentionRequest[] mentions = [new(recipientId, 3, 5)];
    var result = (await Invoke(sending, "mention", clientId, text, null, mentions)).GetProperty("result");
    var messageId = result.GetProperty("id").GetString()!;
    Check(result.GetProperty("mentions")[0].GetProperty("guestId").GetString() == recipientId && result.GetProperty("mentions")[0].GetProperty("nickname").GetString() == "同名访客", "Mention identity and name resolved by server");
    var broadcast = await Frame(receiving, frame => Event(frame, "message.created"));
    Check(broadcast.GetProperty("arguments")[0].GetProperty("mentions")[0].GetProperty("start").GetInt32() == 3, "Mention broadcast preserves UTF-16 offsets");
    var duplicate = (await Invoke(sending, "mention-retry", clientId, text, null, [new(offline.Guest.Id, 3, 5)])).GetProperty("result");
    Check(duplicate.GetProperty("id").GetString() == messageId && duplicate.GetProperty("mentions")[0].GetProperty("guestId").GetString() == recipientId, "Mention retry retains original selected identity");
    Check((await Invoke(sending, "wrong-token", Guid.NewGuid().ToString(), "@其他访客", null, [new(recipientId, 0, 5)])).GetProperty("error").GetString()!.Contains("invalid_mention"), "Forged mention text rejected");
    Check((await Invoke(sending, "wrong-offset", Guid.NewGuid().ToString(), text, null, [new(recipientId, 4, 5)])).GetProperty("error").GetString()!.Contains("invalid_mention"), "Invalid mention offsets rejected");
    Check((await Invoke(sending, "overlap", Guid.NewGuid().ToString(), text, null, [new(recipientId, 3, 5), new(offline.Guest.Id, 3, 5)])).GetProperty("error").GetString()!.Contains("invalid_mention"), "Overlapping mentions rejected");
    Check((await Invoke(sending, "too-many", Guid.NewGuid().ToString(), text, null, Enumerable.Repeat(mentions[0], 11).ToArray())).GetProperty("error").GetString()!.Contains("invalid_mention"), "Mention count bounded");
    Check((await Invoke(sending, "self", Guid.NewGuid().ToString(), "@发送者", null, [new(senderId, 0, 4)])).GetProperty("error").GetString()!.Contains("invalid_mention"), "Self mention rejected");
    Check((await Invoke(sending, "unknown", Guid.NewGuid().ToString(), text, null, [new(Guid.NewGuid().ToString(), 3, 5)])).GetProperty("error").GetString()!.Contains("invalid_mention"), "Unknown mentioned identity rejected");
    var plain = (await Invoke(sending, "plain", Guid.NewGuid().ToString(), "@同名访客 只是普通文字")).GetProperty("result");
    Check(plain.GetProperty("mentions").GetArrayLength() == 0, "Unselected at-text does not notify by nickname");
    Check(repository.Message(messageId)!.Mentions is [{ GuestId: var target }] && target == recipientId, "Mention metadata persisted in history");
    repository.DeleteMessage(messageId, false);
    Check(repository.Message(messageId)!.Mentions!.Length == 0, "Marked message does not expose mentions");
    Check(repository.RestoreMessage(messageId)!.Mentions is [{ GuestId: var restoredTarget }] && restoredTarget == recipientId, "Restoring message restores mention metadata");
    repository.DeleteMessage(messageId, true);
    using (var sql = app.Services.GetRequiredService<ApiDatabase>().OpenConnection())
    using (var command = sql.CreateCommand())
    {
        command.CommandText = "SELECT COUNT(*) FROM chat_message_mentions WHERE message_id=$id";
        command.Parameters.AddWithValue("$id", messageId);
        Check((long)command.ExecuteScalar()! == 0, "Physical deletion removes mention relations");
    }
    await app.StopAsync();
}

var creationLimit = new Dictionary<string, string?>(configuration) { ["Modules:Chat:SessionsPerWindow"] = "1" };
await using (var limited = await Start(creationLimit))
{
    var (fresh, _) = Client(limited);
    using var disposeFresh = fresh;
    await Post(fresh, "/api/chat/session", "{\"nickname\":\"限流访客\"}");
    Check((await Post(fresh, "/api/chat/session", "{\"nickname\":\"限流访客\"}")).StatusCode == HttpStatusCode.TooManyRequests, "HTTP session creation quota enforced");
    await limited.StopAsync();
}

// 默认禁用、错误配置和 schema 故障都不得阻断公共健康接口。
foreach (var mode in new[] { "disabled", "invalid", "schema" })
{
    var config = new Dictionary<string, string?>(configuration);
    if (mode == "disabled") config["Modules:Chat:Enabled"] = "false";
    if (mode == "invalid") config["Modules:Chat:MaxMessageChars"] = "0";
    if (mode == "schema")
    {
        using var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={Path.Combine(root, "chat-tests.db")}");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "UPDATE schema_migrations SET version=99 WHERE owner='chat'";
        command.ExecuteNonQuery();
    }
    await using var app = await Start(config);
    var (client, _) = Client(app);
    using var disposeClient = client;
    Check((await client.GetAsync("/api/health")).IsSuccessStatusCode && (await client.GetAsync("/api/chat/messages")).StatusCode == HttpStatusCode.ServiceUnavailable, "Chat isolated when " + mode);
    await app.StopAsync();
}
Console.WriteLine("Chat targeted checks passed; no production data accessed.");

Check(ChatMarkdown.Summary("# 标题\n\n**粗体** *斜体* [链接](https://example.com)").Contains("粗体 斜体 链接"), "Markdown quote removes formatting before truncation");
Check(ChatMarkdown.Summary("**" + new string('猫', 130) + "**") == new string('猫', 120) + "…", "Markdown quote truncates visible graphemes");
Check(ChatMarkdown.Summary("```\n**代码**\n```") == "**代码**", "Markdown quote preserves code text");

Check(ChatMarkdown.Summary("[链接](<https://example.com>)") == "链接", "Markdown quote accepts editor-serialized links");

Check(ChatMarkdown.Summary("**跨行\n粗体**") == "跨行\n粗体", "Markdown quote supports multiline inline marks");
