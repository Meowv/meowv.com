using System.Text.Json.Serialization;

namespace Meowv.Api.Modules.XiaomiCamera.Infrastructure.Protocol;

[JsonSerializable(typeof(Cs2MissAuthenticationRequest))]
internal partial class Cs2MissJsonContext : JsonSerializerContext;