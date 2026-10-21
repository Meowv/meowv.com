using System.Text.Json.Serialization;
using Meowv.Api.Modules.XiaomiCamera.Cloud;

namespace Meowv.Api.Modules.XiaomiCamera;

// 数据库中的云会话使用源生成 JSON 元数据。
[JsonSerializable(typeof(XiaomiCloudCredentials))]
internal partial class XiaomiStorageJsonContext : JsonSerializerContext;