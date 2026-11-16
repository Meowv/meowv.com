using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;

// 仅用于本机联调；临时项目链接此文件，不进入产品宿主或解决方案。
var backendText = Environment.GetEnvironmentVariable("MUSIC_TEST_BACKEND_URL") ?? throw new InvalidOperationException("Missing test backend.");
var backend = new Uri(backendText);
if (backend.Scheme != "http" || !backend.IsLoopback) throw new InvalidOperationException("Test backend must be loopback.");
var mediaDirectory = Environment.GetEnvironmentVariable("MUSIC_TEST_MEDIA_DIR") ?? throw new InvalidOperationException("Missing test media.");
var files = new Dictionary<string, string>
{
    ["original-001.mp3"] = Path.Combine(mediaDirectory, "original-001.mp3"),
    ["original-002.mp3"] = Path.Combine(mediaDirectory, "original-002.mp3"),
};
if (files.Values.Any(path => !File.Exists(path))) throw new InvalidOperationException("Missing owned test audio.");

using var key = RSA.Create(2048);
var request = new CertificateRequest("CN=MeowvTune ephemeral local test", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
var names = new SubjectAlternativeNameBuilder();
names.AddDnsName("api.music.test");
names.AddDnsName("media.music.test");
request.CertificateExtensions.Add(names.Build());
request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
var usages = new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") };
request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(usages, false));
using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddHours(1));
var pin = Convert.ToHexString(SHA256.HashData(key.ExportSubjectPublicKeyInfo()));
var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
builder.Configuration.Sources.Clear();
builder.Logging.ClearProviders();
builder.WebHost.ConfigureKestrel(server =>
{
    server.Limits.MaxRequestBodySize = 4096;
    server.Listen(IPAddress.Loopback, 0, endpoint => endpoint.UseHttps(certificate));
});
await using var app = builder.Build();
using var http = new HttpClient(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(8) };
var traffic = new ConcurrentQueue<GatewayRequest>();
long sequence = 0;
app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? "";
    var method = context.Request.Method;
    var authorized = context.Request.Headers.ContainsKey("Authorization");
    var range = context.Request.Headers.ContainsKey("Range");
    var https = context.Request.IsHttps;
    context.Response.OnCompleted(() =>
    {
        traffic.Enqueue(new GatewayRequest(Interlocked.Increment(ref sequence), path, method, context.Response.StatusCode,
            context.Response.ContentLength, range, authorized, https, context.Response.ContentType, context.Response.Headers.ContentRange));
        while (traffic.Count > 256) traffic.TryDequeue(out _);
        return Task.CompletedTask;
    });
    await next(context);
});
app.MapMethods("/audio/{name}", ["GET", "HEAD"], (string name, HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    if (context.Request.Headers.ContainsKey("Authorization")) return Results.StatusCode(403);
    return files.TryGetValue(name, out var path) ? Results.File(path, "audio/mpeg", enableRangeProcessing: true) : Results.NotFound();
});
app.MapMethods("/api/music/{**path}", ["GET", "POST"], async (HttpContext context) =>
{
    var target = new Uri(backend, context.Request.Path + context.Request.QueryString);
    using var message = new HttpRequestMessage(new HttpMethod(context.Request.Method), target);
    if (context.Request.Headers.TryGetValue("Authorization", out var authorization))
        message.Headers.TryAddWithoutValidation("Authorization", authorization.ToString());
    if (HttpMethods.IsPost(context.Request.Method))
    {
        var bytes = new byte[4097];
        var length = 0;
        while (length < bytes.Length)
        {
            var read = await context.Request.Body.ReadAsync(bytes.AsMemory(length), context.RequestAborted);
            if (read == 0) break;
            length += read;
        }
        if (length > 4096) { context.Response.StatusCode = 400; return; }
        message.Content = new ByteArrayContent(bytes, 0, length);
        message.Content.Headers.TryAddWithoutValidation("Content-Type", context.Request.ContentType ?? "application/json");
    }
    using var response = await http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
    context.Response.StatusCode = (int)response.StatusCode;
    context.Response.ContentType = response.Content.Headers.ContentType?.ToString();
    context.Response.Headers.CacheControl = "no-store";
    if (response.Headers.RetryAfter is not null) context.Response.Headers.RetryAfter = response.Headers.RetryAfter.ToString();
    await response.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
});
app.MapGet("/test/status", () => Results.Json(new GatewayStatus(traffic.ToArray()), GatewayJsonContext.Default.GatewayStatus));
await app.StartAsync();
var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
Console.WriteLine("MUSIC_HTTPS_READY " + JsonSerializer.Serialize(new GatewayReady(new Uri(address).Port, pin), GatewayJsonContext.Default.GatewayReady));
await app.WaitForShutdownAsync();

internal sealed record GatewayReady(int Port, string SpkiSha256);
internal sealed record GatewayRequest(long Sequence, string Path, string Method, int Status, long? Bytes, bool Range, bool Authorization, bool Https, string? ContentType, string? ContentRange);
internal sealed record GatewayStatus(GatewayRequest[] Requests);
[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(GatewayReady))]
[JsonSerializable(typeof(GatewayStatus))]
internal partial class GatewayJsonContext : JsonSerializerContext;
