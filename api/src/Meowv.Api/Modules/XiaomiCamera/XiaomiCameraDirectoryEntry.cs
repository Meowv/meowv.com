using Meowv.Api.Modules.XiaomiCamera.Contracts;

namespace Meowv.Api.Modules.XiaomiCamera;

public sealed record XiaomiCameraDirectoryEntry(CameraDescriptor Camera, CameraTransportProbeResult Probe);