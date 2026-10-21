using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;

namespace Meowv.Api.Modules.XiaomiCamera.Cloud;

/// <summary>
/// 仅供受 API 管理密钥保护的初始化页面使用的小米账号登录流程。会话和密码只在当前进程内短暂保存，
/// 不会序列化、记录或通过 HTTP 响应返回。
/// </summary>
public sealed class XiaomiAccountLoginFlow : IDisposable
{
    private const string AccountBaseUrl = "https://account.xiaomi.com";
    private static readonly TimeSpan PendingLoginLifetime = TimeSpan.FromMinutes(10);
    private readonly ConcurrentDictionary<Guid, PendingLogin> _pendingLogins = new();
    private readonly Timer _cleanupTimer;

    public XiaomiAccountLoginFlow()
    {
        // 待二次验证对象持有密码与 Cookie；定时回收可避免用户离开页面后敏感数据长期驻留。
        _cleanupTimer = new Timer(_ => RemoveExpired(), null, PendingLoginLifetime, PendingLoginLifetime);
    }

    public async Task<XiaomiLoginAttempt> StartAsync(string username, string password, string region, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(username);
        ArgumentException.ThrowIfNullOrWhiteSpace(password);
        RemoveExpired();
        var pending = PendingLogin.Create(username, password, region);
        _pendingLogins[pending.Id] = pending;

        try
        {
            return await LoginWithPasswordAsync(pending, cancellationToken);
        }
        catch
        {
            Remove(pending.Id);
            throw;
        }
    }

    public async Task<XiaomiLoginAttempt> SubmitVerificationCodeAsync(Guid attemptId, string code, CancellationToken cancellationToken)
    {
        if (!_pendingLogins.TryGetValue(attemptId, out var pending) || pending.IsExpired(PendingLoginLifetime) || pending.Verification is null)
        {
            Remove(attemptId);
            throw new XiaomiCloudException("登录验证已失效，请重新开始。");
        }

        ArgumentException.ThrowIfNullOrWhiteSpace(code);
        var verification = pending.Verification;
        var uri = new Uri($"{AccountBaseUrl}/identity/auth/verify{verification.Channel}?_flag={verification.Flag}&ticket={Uri.EscapeDataString(code)}&trust=false&_json=true");
        using var request = new HttpRequestMessage(HttpMethod.Post, uri);
        request.Headers.TryAddWithoutValidation("Cookie", $"identity_session={verification.IdentitySession}");
        using var response = await pending.Client.SendAsync(request, cancellationToken);
        CaptureCookies(pending, response);
        CaptureSessionMetadata(pending, response);
        var payload = await ReadLoginPayloadAsync(response, cancellationToken);
        var location = GetOptionalString(payload.RootElement, "location");
        if (string.IsNullOrWhiteSpace(location))
        {
            throw new XiaomiCloudException("二次验证未通过，请检查验证码后重新尝试。");
        }

        return await CompleteAsync(pending, location, cancellationToken);
    }

    public void Dispose()
    {
        _cleanupTimer.Dispose();
        foreach (var key in _pendingLogins.Keys)
        {
            Remove(key);
        }
    }

    private async Task<XiaomiLoginAttempt> LoginWithPasswordAsync(PendingLogin pending, CancellationToken cancellationToken)
    {
        var startUri = new Uri($"{AccountBaseUrl}/pass/serviceLogin?_json=true&sid=xiaomiio");
        using var startResponse = await pending.Client.GetAsync(startUri, cancellationToken);
        CaptureCookies(pending, startResponse);
        CaptureSessionMetadata(pending, startResponse);
        using var start = await ReadLoginPayloadAsync(startResponse, cancellationToken);
        var sid = GetRequiredString(start.RootElement, "sid");
        var callback = GetRequiredString(start.RootElement, "callback");
        var sign = GetRequiredString(start.RootElement, "_sign");
        var qs = GetRequiredString(start.RootElement, "qs");
        var passwordHash = Convert.ToHexString(MD5.HashData(System.Text.Encoding.UTF8.GetBytes(pending.Password)));
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["_json"] = "true",
            ["hash"] = passwordHash,
            ["sid"] = sid,
            ["callback"] = callback,
            ["_sign"] = sign,
            ["qs"] = qs,
            ["user"] = pending.Username,
        });
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri($"{AccountBaseUrl}/pass/serviceLoginAuth2"));
        request.Content = content;
        using var response = await pending.Client.SendAsync(request, cancellationToken);
        CaptureCookies(pending, response);
        CaptureSessionMetadata(pending, response);
        using var login = await ReadLoginPayloadAsync(response, cancellationToken);

        var location = GetOptionalString(login.RootElement, "location");
        if (!string.IsNullOrWhiteSpace(location))
        {
            pending.Ssecurity = GetRequiredString(login.RootElement, "ssecurity");
            return await CompleteAsync(pending, location, cancellationToken);
        }

        var notificationUrl = GetOptionalString(login.RootElement, "notificationUrl");
        if (!string.IsNullOrWhiteSpace(notificationUrl))
        {
            return await StartVerificationAsync(pending, notificationUrl, cancellationToken);
        }

        if (!string.IsNullOrWhiteSpace(GetOptionalString(login.RootElement, "captchaUrl")))
        {
            throw new XiaomiCloudException("小米账号要求图形验证码；请稍后在米家 App 或账号网页完成验证后重试。");
        }

        throw new XiaomiCloudException("小米账号登录失败；请检查账号、密码或账号安全状态。");
    }

    private static async Task<XiaomiLoginAttempt> StartVerificationAsync(PendingLogin pending, string notificationUrl, CancellationToken cancellationToken)
    {
        var identityListUrl = notificationUrl.Replace("/fe/service/identity/authStart", "/identity/list", StringComparison.Ordinal);
        using var listResponse = await pending.Client.GetAsync(identityListUrl, cancellationToken);
        CaptureCookies(pending, listResponse);
        CaptureSessionMetadata(pending, listResponse);
        using var list = await ReadLoginPayloadAsync(listResponse, cancellationToken);
        var flag = GetRequiredInt(list.RootElement, "flag");
        var channel = flag switch
        {
            4 => "Phone",
            8 => "Email",
            _ => throw new XiaomiCloudException("小米账号返回了不支持的二次验证方式。"),
        };
        var identitySession = GetCookie(pending.Cookies, new Uri(identityListUrl), "identity_session") ?? throw new XiaomiCloudException("未获取到二次验证会话。");

        var maskedPhone = GetOptionalString(list.RootElement, "maskedPhone");
        var maskedEmail = GetOptionalString(list.RootElement, "maskedEmail");
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["_json"] = "true",
            ["retry"] = "0",
        });
        using var ticketRequest = new HttpRequestMessage(HttpMethod.Post, new Uri($"{AccountBaseUrl}/identity/auth/send{channel}Ticket"));
        ticketRequest.Content = content;
        ticketRequest.Headers.TryAddWithoutValidation("Cookie", $"identity_session={identitySession}");
        using var ticketResponse = await pending.Client.SendAsync(ticketRequest, cancellationToken);
        CaptureCookies(pending, ticketResponse);
        CaptureSessionMetadata(pending, ticketResponse);
        using var ticket = await ReadLoginPayloadAsync(ticketResponse, cancellationToken);
        if (GetRequiredInt(ticket.RootElement, "code") != 0)
        {
            throw new XiaomiCloudException("小米未能发送二次验证码，请稍后重试。");
        }

        pending.Verification = new PendingVerification(flag, channel, identitySession);
        return XiaomiLoginAttempt.NeedsVerification(pending.Id, channel == "Phone" ? maskedPhone : maskedEmail, channel == "Phone" ? "手机验证码" : "邮箱验证码");
    }

    private async Task<XiaomiLoginAttempt> CompleteAsync(PendingLogin pending, string location, CancellationToken cancellationToken)
    {
        await FollowLoginRedirectsAsync(pending, location, cancellationToken);
        var userId = GetSessionCookie(pending, "userId") ?? throw new XiaomiCloudException("登录完成后未获取到用户会话。");
        var cUserId = GetSessionCookie(pending, "cUserId") ?? userId;
        var serviceToken = GetSessionCookie(pending, "serviceToken") ?? throw new XiaomiCloudException("登录完成后未获取到服务会话。");
        if (string.IsNullOrWhiteSpace(pending.Ssecurity))
        {
            throw new XiaomiCloudException("登录完成后未获取到请求签名密钥。");
        }

        var credentials = new XiaomiCloudCredentials(userId, cUserId, pending.Ssecurity, serviceToken, pending.Region);
        Remove(pending.Id);
        return XiaomiLoginAttempt.Authenticated(credentials);
    }

    private static async Task FollowLoginRedirectsAsync(PendingLogin pending, string location, CancellationToken cancellationToken)
    {
        var current = new Uri(location, UriKind.Absolute);
        for (var redirects = 0; redirects < 10; redirects++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, current);
            using var response = await pending.Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            CaptureCookies(pending, response);
            CaptureSessionMetadata(pending, response);
            if ((int)response.StatusCode is < 300 or >= 400)
            {
                if (!response.IsSuccessStatusCode)
                {
                    throw new XiaomiCloudException($"小米账号登录跳转失败：HTTP {(int)response.StatusCode}。");
                }

                return;
            }

            var next = response.Headers.Location;
            if (next is null)
            {
                throw new XiaomiCloudException("小米账号登录跳转缺少目标地址。");
            }

            current = next.IsAbsoluteUri ? next : new Uri(current, next);
        }

        throw new XiaomiCloudException("小米账号登录跳转次数过多。");
    }

    private void Remove(Guid id)
    {
        if (_pendingLogins.TryRemove(id, out var pending))
        {
            pending.Dispose();
        }
    }

    private void RemoveExpired()
    {
        foreach (var (id, pending) in _pendingLogins)
        {
            if (pending.IsExpired(PendingLoginLifetime))
            {
                Remove(id);
            }
        }
    }

    private static async Task<JsonDocument> ReadLoginPayloadAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new XiaomiCloudException($"小米账号服务返回 HTTP {(int)response.StatusCode}。");
        }

        const string prefix = "&&&START&&&";
        return !content.StartsWith(prefix, StringComparison.Ordinal) ? throw new XiaomiCloudException("小米账号服务返回了无法识别的响应。") : JsonDocument.Parse(content[prefix.Length..]);
    }

    private static string GetRequiredString(JsonElement element, string property) => GetOptionalString(element, property) ?? throw new XiaomiCloudException($"登录响应缺少 {property}。");

    private static string? GetOptionalString(JsonElement element, string property) => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static int GetRequiredInt(JsonElement element, string property) => element.TryGetProperty(property, out var value) && value.TryGetInt32(out var number) ? number : throw new XiaomiCloudException($"登录响应缺少 {property}。");

    private static string? GetCookie(CookieContainer cookies, Uri uri, string name) => cookies.GetCookies(uri).FirstOrDefault(cookie => cookie.Name == name)?.Value;

    private static void CaptureCookies(PendingLogin pending, HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var headers))
        {
            return;
        }

        foreach (var header in headers)
        {
            var separator = header.IndexOf(';');
            var nameValue = separator >= 0 ? header[..separator] : header;
            var equals = nameValue.IndexOf('=');
            if (equals > 0)
            {
                pending.CapturedCookies[nameValue[..equals]] = nameValue[(equals + 1)..];
            }
        }
    }

    private static void CaptureSessionMetadata(PendingLogin pending, HttpResponseMessage response)
    {
        if (!string.IsNullOrWhiteSpace(pending.Ssecurity) ||
            !response.Headers.TryGetValues("Extension-Pragma", out var values))
        {
            return;
        }

        foreach (var value in values)
        {
            try
            {
                using var document = JsonDocument.Parse(value);
                var ssecurity = GetOptionalString(document.RootElement, "ssecurity");
                if (string.IsNullOrWhiteSpace(ssecurity)) continue;
                pending.Ssecurity = ssecurity;
                return;
            }
            catch (JsonException)
            {
                // 该头并非所有重定向都会返回 JSON；忽略无关值，继续处理本次登录链路。
            }
        }
    }

    private static string? GetSessionCookie(PendingLogin pending, string name) => pending.CapturedCookies.TryGetValue(name, out var captured)
        ? captured
        : GetCookie(pending.Cookies, new Uri(AccountBaseUrl), name)
          ?? GetCookie(pending.Cookies, new Uri("https://api.io.mi.com"), name)
          ?? GetCookie(pending.Cookies, new Uri("https://sts.api.io.mi.com"), name);

    private sealed class PendingLogin : IDisposable
    {
        private PendingLogin(string username, string password, string region, CookieContainer cookies, HttpClient client, Guid id)
        {
            Username = username;
            Password = password;
            Region = region;
            Cookies = cookies;
            Client = client;
            Id = id;
        }

        public Guid Id { get; }
        private DateTimeOffset CreatedAt { get; } = DateTimeOffset.UtcNow;
        public string Username { get; }
        public string Password { get; }
        public string Region { get; }
        public CookieContainer Cookies { get; }
        public HttpClient Client { get; }
        public Dictionary<string, string> CapturedCookies { get; } = new(StringComparer.Ordinal);
        public string? Ssecurity { get; set; }
        public PendingVerification? Verification { get; set; }

        public bool IsExpired(TimeSpan lifetime) => DateTimeOffset.UtcNow - CreatedAt >= lifetime;

        public static PendingLogin Create(string username, string password, string region)
        {
            var cookies = new CookieContainer();
            cookies.Add(new Uri(AccountBaseUrl), new Cookie("deviceId", Convert.ToHexString(RandomNumberGenerator.GetBytes(8))));
            var handler = new HttpClientHandler
            {
                AllowAutoRedirect = false,
                CookieContainer = cookies,
            };
            return new PendingLogin(username, password, region, cookies, new HttpClient(handler), Guid.NewGuid());
        }

        public void Dispose() => Client.Dispose();
    }

    private sealed record PendingVerification(int Flag, string Channel, string IdentitySession);
}

public sealed record XiaomiLoginAttempt(Guid? AttemptId, XiaomiCloudCredentials? Credentials, string? VerificationDestination, string? VerificationKind)
{
    public bool IsAuthenticated => Credentials is not null;

    public static XiaomiLoginAttempt Authenticated(XiaomiCloudCredentials credentials) => new(null, credentials, null, null);

    public static XiaomiLoginAttempt NeedsVerification(Guid attemptId, string? destination, string kind) => new(attemptId, null, destination, kind);
}
