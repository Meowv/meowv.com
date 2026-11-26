namespace Meowv.Api.Modules.Studio.Application.Ports;

public interface IStudioUserAssetStore
{
    Task<string> SaveAsync(Guid userId, string fileName, ReadOnlyMemory<byte> content, CancellationToken cancellationToken);

    Task DeleteAsync(string relativePath, CancellationToken cancellationToken);

    string? Resolve(string relativePath);
}