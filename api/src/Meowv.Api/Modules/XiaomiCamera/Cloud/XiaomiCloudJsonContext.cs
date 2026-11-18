using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.XiaomiCamera.Cloud;

[JsonSerializable(typeof(XiaomiTransportVendorRequest))]
internal partial class XiaomiCloudJsonContext : JsonSerializerContext;