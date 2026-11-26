namespace Meowv.Api.Modules.XiaomiCamera.Api.Contracts;

public interface ICameraCatalog
{
    Task<IReadOnlyList<CameraDescriptor>> DiscoverAsync(CancellationToken cancellationToken);
}