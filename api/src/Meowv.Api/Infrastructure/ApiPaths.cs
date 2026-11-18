namespace Meowv.Api.Infrastructure;

public sealed class ApiPaths(IHostEnvironment environment)
{
    public string Root { get; } = environment.ContentRootPath;
    public string Resolve(string path) => Path.GetFullPath(path, Root);
}