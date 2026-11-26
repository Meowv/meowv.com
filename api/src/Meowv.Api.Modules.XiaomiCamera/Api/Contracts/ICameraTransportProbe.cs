namespace Meowv.Api.Modules.XiaomiCamera.Api.Contracts;

public interface ICameraTransportProbe
{
    Task<CameraTransportProbeResult> ProbeAsync(CameraDescriptor camera, CancellationToken cancellationToken);
}