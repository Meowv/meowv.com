using System.Text.Json.Serialization;
using XiaomiCamera.Cloud;

namespace XiaomiCamera;

// 数据库中的云会话沿用原有 PascalCase 字段，保持历史密文解密后的 JSON 兼容。
[JsonSerializable(typeof(XiaomiCloudCredentials))]
internal partial class XiaomiStorageJsonContext : JsonSerializerContext;