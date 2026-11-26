namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed partial class StudioUserAssetStore : IStudioUserAssetStore
{
    private readonly ILogger<StudioUserAssetStore> _logger;
    private readonly string _root;

    public StudioUserAssetStore(ApiPaths paths, StudioOptions options, ILogger<StudioUserAssetStore> logger)
    {
        _root = Path.GetFullPath(paths.Resolve(options.AvatarDirectory));
        Directory.CreateDirectory(_root);
        _logger = logger;
    }

    public async Task<string> SaveAsync(Guid userId, string fileName, ReadOnlyMemory<byte> content, CancellationToken cancellationToken)
    {
        var safeName = Path.GetFileName(fileName);
        var relative = Path.Combine(userId.ToString("N"), safeName);
        var absolute = Path.Combine(_root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(absolute)!);

        var temp = $"{absolute}.{Guid.NewGuid():N}.tmp";
        await File.WriteAllBytesAsync(temp, content.ToArray(), cancellationToken);
        File.Move(temp, absolute, true);

        if (!OperatingSystem.IsWindows())
            try
            {
                File.SetUnixFileMode(absolute, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                LogPermissionFailed(ex, relative);
            }

        return relative.Replace('\\', '/');
    }

    public Task DeleteAsync(string relativePath, CancellationToken cancellationToken)
    {
        var absolute = Resolve(relativePath);
        if (absolute is not null && File.Exists(absolute))
            try
            {
                File.Delete(absolute);
            }
            catch (IOException ex)
            {
                LogDeleteFailed(ex, relativePath);
            }

        return Task.CompletedTask;
    }

    public string? Resolve(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return null;

        var combined = Path.GetFullPath(Path.Combine(_root, relativePath));
        var rootWithSeparator = _root.EndsWith(Path.DirectorySeparatorChar) ? _root : _root + Path.DirectorySeparatorChar;
        return combined.StartsWith(rootWithSeparator, StringComparison.Ordinal) ? combined : null;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not restrict permissions on {Path}")]
    private partial void LogPermissionFailed(Exception exception, string path);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not delete asset {Path}")]
    private partial void LogDeleteFailed(Exception exception, string path);
}