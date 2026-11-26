using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.XiaomiCamera.Api;

[JsonSerializable(typeof(XiaomiCloudCredentials))]
internal partial class XiaomiStorageJsonContext : JsonSerializerContext;