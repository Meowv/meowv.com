using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.XiaomiCamera.Infrastructure.Cloud;

[JsonSerializable(typeof(XiaomiTransportVendorRequest))]
internal partial class XiaomiCloudJsonContext : JsonSerializerContext;