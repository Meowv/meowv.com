namespace Meowv.Api.Modules.XiaomiCamera.Contracts;

public sealed record CameraTransportProbeResult(CameraDescriptor Camera, int TransportVendor, string Transport, bool IsCs2Compatible);