using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;

namespace Meowv.Api.Modules.XiaomiCamera;

[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(XiaomiModuleHealthResponse))]
[JsonSerializable(typeof(XiaomiSetupLoginRequest))]
[JsonSerializable(typeof(XiaomiSetupVerificationRequest))]
[JsonSerializable(typeof(XiaomiSetupError))]
[JsonSerializable(typeof(List<XiaomiPlaybackCamera>))]
[JsonSerializable(typeof(XiaomiPlaybackSessionRequest))]
[JsonSerializable(typeof(XiaomiMotorStepRequest))]
[JsonSerializable(typeof(XiaomiMotorStepResponse))]
[JsonSerializable(typeof(XiaomiPlaybackSessionResponse))]
[JsonSerializable(typeof(XiaomiSetupResponse))]
[JsonSerializable(typeof(XiaomiPlaybackPreparation))]
[JsonSerializable(typeof(ProblemDetails))]
internal partial class XiaomiHttpJsonContext : JsonSerializerContext;