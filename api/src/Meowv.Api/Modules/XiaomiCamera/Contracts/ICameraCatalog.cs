namespace Meowv.Api.Modules.XiaomiCamera.Contracts;

public interface ICameraCatalog
{
    Task<IReadOnlyList<CameraDescriptor>> DiscoverAsync(CancellationToken cancellationToken);
}