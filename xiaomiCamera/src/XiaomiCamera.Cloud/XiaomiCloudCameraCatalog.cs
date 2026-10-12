using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using XiaomiCamera.Core;
using XiaomiCamera.Protocol;

namespace XiaomiCamera.Cloud;

/// <summary>封装小米云设备目录、传输探测与 CS2 provisioning 请求。</summary>
public sealed class XiaomiCloudCameraCatalog(HttpClient httpClient, XiaomiCloudCredentials credentials) : ICameraCatalog, ICameraTransportProbe
{
    private const string DeviceListPath = "/home/device_list";
    private const string VendorPath = "/v2/device/miss_get_vendor";

    public async Task<IReadOnlyList<CameraDescriptor>> DiscoverAsync(CancellationToken cancellationToken)
    {
        using var result = await PostResultAsync(DeviceListPath, "{\"getVirtualModel\":false,\"getHuamiDevices\":1}", cancellationToken);
        var list = GetDeviceList(result.RootElement);
        var cameras = new List<CameraDescriptor>();

        foreach (var device in list.EnumerateArray())
        {
            var model = GetRequiredString(device, "model");
            if (!IsCameraCandidate(model))
            {
                continue;
            }

            cameras.Add(new CameraDescriptor(GetRequiredString(device, "did"), model, GetOptionalString(device, "name") ?? "未命名摄像头", credentials.Region, GetBoolean(device, "isOnline"), null));
        }

        return cameras;
    }

    public async Task<CameraTransportProbeResult> ProbeAsync(CameraDescriptor camera, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(camera);
        using var keyPair = Cs2KeyPair.Create();
        var vendor = await GetVendorAsync(camera, keyPair.PublicKeyHex, cancellationToken);
        var transport = vendor switch
        {
            1 => "tutk",
            3 => "agora",
            4 => "cs2",
            6 => "mtp",
            _ => "unknown",
        };
        return new CameraTransportProbeResult(camera, vendor, transport, vendor == 4);
    }

    public async Task<Cs2Provisioning> ProvisionCs2Async(CameraDescriptor camera, Cs2KeyPair keyPair, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(camera);
        ArgumentNullException.ThrowIfNull(keyPair);

        using var result = await PostVendorAsync(camera, keyPair.PublicKeyHex, cancellationToken);
        var vendor = GetVendor(result.RootElement);
        if (vendor != 4)
        {
            throw new XiaomiCloudException($"设备返回的 Transport Vendor 为 {vendor}，不是 CS2。");
        }

        if (!result.RootElement.TryGetProperty("vendor", out var vendorElement) || vendorElement.ValueKind != JsonValueKind.Object ||
            !vendorElement.TryGetProperty("vendor_params", out var parameters) || parameters.ValueKind != JsonValueKind.Object)
        {
            throw new XiaomiCloudException("CS2 provisioning 响应缺少 vendor_params。");
        }

        var p2PId = GetRequiredString(parameters, "p2p_id");
        var initString = GetRequiredString(parameters, "init_string");
        var devicePublicKey = GetRequiredString(result.RootElement, "public_key");
        var sign = GetRequiredString(result.RootElement, "sign");
        try
        {
            var servers = Cs2InitString.DecodeServers(initString);
            return servers.Count == 0 ? throw new FormatException("未包含 rendezvous 地址。") : new Cs2Provisioning(Cs2Uid.Parse(p2PId), servers, keyPair.PublicKeyHex, devicePublicKey, sign);
        }
        catch (FormatException exception)
        {
            throw new XiaomiCloudException("CS2 provisioning 参数格式无效。", exception);
        }
    }

    private async Task<int> GetVendorAsync(CameraDescriptor camera, string appPublicKey, CancellationToken cancellationToken)
    {
        using var result = await PostVendorAsync(camera, appPublicKey, cancellationToken);
        return GetVendor(result.RootElement);
    }

    private Task<JsonDocument> PostVendorAsync(CameraDescriptor camera, string appPublicKey, CancellationToken cancellationToken)
    {
        var request = JsonSerializer.Serialize(new
        {
            app_pubkey = appPublicKey,
            did = camera.Id,
            support_vendors = "TUTK_CS2_MTP",
        });

        return PostResultAsync(VendorPath, request, cancellationToken);
    }

    private async Task<JsonDocument> PostResultAsync(string path, string json, CancellationToken cancellationToken)
    {
        // 云响应以当前请求 nonce 加密；同一 nonce 与 ssecurity 只在这个作用域使用。
        var ssecurity = credentials.GetSsecurityBytes();
        var nonce = XiaomiCloudRequestSigner.CreateNonce(DateTimeOffset.UtcNow);
        try
        {
            var form = XiaomiCloudRequestSigner.CreateForm(path, json, ssecurity, nonce);
            using var content = new FormUrlEncodedContent(form);
            using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(credentials.GetApiBaseUri(), path.TrimStart('/')));
            request.Content = content;
            request.Headers.TryAddWithoutValidation(
                "Cookie",
                $"userId={credentials.UserId}; cUserId={credentials.CUserId}; serviceToken={credentials.ServiceToken}");

            using var response = await httpClient.SendAsync(request, cancellationToken);
            if (response.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
            {
                throw new XiaomiCloudSessionExpiredException();
            }

            if (!response.IsSuccessStatusCode)
            {
                throw new XiaomiCloudException($"小米云请求失败：HTTP {(int)response.StatusCode}。");
            }

            var encrypted = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            try
            {
                var plaintext = XiaomiCloudRequestSigner.DecryptResponse(encrypted, ssecurity, nonce);
                try
                {
                    using var envelope = JsonDocument.Parse(Encoding.UTF8.GetString(plaintext));
                    if (!envelope.RootElement.TryGetProperty("code", out var code) || code.GetInt32() != 0)
                    {
                        var message = GetOptionalString(envelope.RootElement, "message") ?? "未知错误";
                        throw new XiaomiCloudException($"小米云返回错误：{message}");
                    }

                    if (!envelope.RootElement.TryGetProperty("result", out var result))
                    {
                        throw new XiaomiCloudException("小米云响应不包含 result。");
                    }

                    return JsonDocument.Parse(result.GetRawText());
                }
                finally
                {
                    CryptographicOperations.ZeroMemory(plaintext);
                }
            }
            finally
            {
                CryptographicOperations.ZeroMemory(encrypted);
            }
        }
        catch (Exception exception) when (exception is FormatException or JsonException or CryptographicException)
        {
            throw new XiaomiCloudException("小米云响应无法解密或解析；请检查区域和会话是否仍有效。", exception);
        }
        finally
        {
            // ssecurity 与 nonce 仅用于本次请求签名，结束后立即清理托管字节数组。
            CryptographicOperations.ZeroMemory(ssecurity);
            CryptographicOperations.ZeroMemory(nonce);
        }
    }

    private static JsonElement GetDeviceList(JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Array)
        {
            return root;
        }

        if (root.TryGetProperty("list", out var list) && list.ValueKind == JsonValueKind.Array)
        {
            return list;
        }

        throw new XiaomiCloudException("设备列表响应不包含 list 数组。");
    }

    private static int GetVendor(JsonElement root)
    {
        if (root.TryGetProperty("vendor", out var vendor))
        {
            if (vendor.ValueKind == JsonValueKind.Number)
            {
                return vendor.GetInt32();
            }

            if (vendor.ValueKind == JsonValueKind.Object && vendor.TryGetProperty("vendor", out var id))
            {
                return id.GetInt32();
            }
        }

        throw new XiaomiCloudException("设备未返回 Transport Vendor。");
    }

    private static bool IsCameraCandidate(string model) => model.Contains(".camera.", StringComparison.OrdinalIgnoreCase) || model.Contains(".cateye.", StringComparison.OrdinalIgnoreCase) || model.Contains(".feeder.", StringComparison.OrdinalIgnoreCase);

    private static string GetRequiredString(JsonElement element, string property) => GetOptionalString(element, property) ?? throw new XiaomiCloudException($"设备响应缺少 {property}。");

    private static string? GetOptionalString(JsonElement element, string property) => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static bool GetBoolean(JsonElement element, string property) => element.TryGetProperty(property, out var value) && value.ValueKind switch
    {
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => value.GetInt32() != 0,
        _ => false,
    };
}

public class XiaomiCloudException(string message, Exception? innerException = null) : Exception(message, innerException);

public sealed class XiaomiCloudSessionExpiredException() : XiaomiCloudException("已保存的小米登录会话已失效，请重新登录。");