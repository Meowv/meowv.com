using System.Runtime.InteropServices;
using Meowv.Api.Infrastructure;
using Meowv.Api.Modules.XiaomiCamera;
using Microsoft.Extensions.Options;

internal static class FfmpegPathChecks
{
    public static void Run(string root)
    {
        // 定向宿主在 Unix 上用合成可执行文件验证解析，不调用真实 FFmpeg。
        if (OperatingSystem.IsWindows()) return;
        var directory = Path.Combine(root, "ffmpeg path checks");
        var published = Path.Combine(directory, "published");
        Directory.CreateDirectory(published);
        var bundled = Path.Combine(published, "ffmpeg");
        WriteExecutable(bundled);
        var production = EnvironmentFor(published, Environments.Production);
        var resolver = Create(production);
        Check(resolver.ExecutablePath == bundled && resolver.Source == "发布包内置文件", "Adjacent published FFmpeg");

        var configured = Path.Combine(directory, "configured tool", "ffmpeg");
        WriteExecutable(configured);
        Check(Create(production, configured).ExecutablePath == configured, "Explicit FFmpeg must take priority");
        try
        {
            _ = Create(production, Path.Combine(directory, "missing"));
            throw new Exception("Invalid explicit FFmpeg path must not fall back to adjacent tool.");
        }
        catch (InvalidOperationException) { }

        var development = Path.Combine(directory, "api", "src", "Meowv.Api");
        Directory.CreateDirectory(development);
        var rid = (OperatingSystem.IsMacOS() ? "osx" : "linux") + "-" +
                  (RuntimeInformation.ProcessArchitecture == Architecture.Arm64 ? "arm64" : "x64");
        var cached = Path.Combine(directory, "api", "build", rid, "ffmpeg");
        WriteExecutable(cached);
        resolver = Create(EnvironmentFor(development, Environments.Development));
        Check(resolver.ExecutablePath == cached && resolver.Source == "API 开发缓存", "Development RID directory");
    }

    private static IHostEnvironment EnvironmentFor(string root, string name) =>
        WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = root, EnvironmentName = name }).Environment;

    private static XiaomiFfmpegResolver Create(IHostEnvironment environment, string? configured = null)
    {
        var paths = new ApiPaths(environment);
        var options = new XiaomiCameraOptions(Options.Create(new XiaomiModuleOptions()),
            Options.Create(new FfmpegOptions { Path = configured }), paths);
        return new XiaomiFfmpegResolver(options, paths, environment);
    }

    private static void WriteExecutable(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, "#!/bin/sh\necho libx264\n");
        if (!OperatingSystem.IsWindows())
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}
