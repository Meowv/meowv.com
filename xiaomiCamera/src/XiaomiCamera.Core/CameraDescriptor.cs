namespace XiaomiCamera.Core;

/// <summary>不包含账号令牌、设备密钥或媒体密钥的摄像头公开描述。</summary>
public sealed record CameraDescriptor(string Id, string Model, string DisplayName, string Region, bool IsOnline, int? TransportVendor);