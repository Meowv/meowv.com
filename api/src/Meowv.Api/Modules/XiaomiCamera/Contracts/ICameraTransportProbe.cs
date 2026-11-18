namespace Meowv.Api.Modules.XiaomiCamera.Contracts;

public interface ICameraTransportProbe
{
    Task<CameraTransportProbeResult> ProbeAsync(CameraDescriptor camera, CancellationToken cancellationToken);
}