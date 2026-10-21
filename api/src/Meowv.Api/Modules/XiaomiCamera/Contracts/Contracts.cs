namespace Meowv.Api.Modules.XiaomiCamera.Contracts;

public interface ICameraCatalog
{
    Task<IReadOnlyList<CameraDescriptor>> DiscoverAsync(CancellationToken cancellationToken);
}

public interface ICameraTransportProbe
{
    Task<CameraTransportProbeResult> ProbeAsync(CameraDescriptor camera, CancellationToken cancellationToken);
}

public sealed record CameraTransportProbeResult(CameraDescriptor Camera, int TransportVendor, string Transport, bool IsCs2Compatible);