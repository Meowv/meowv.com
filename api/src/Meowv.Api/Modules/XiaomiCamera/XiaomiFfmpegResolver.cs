using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Meowv.Api.Infrastructure;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>
/// 解析并预检媒体转码器。发布与开发均使用 API 自己的工具缓存，也可回退到系统 PATH。
/// </summary>
public sealed class XiaomiFfmpegResolver
{
    private static readonly TimeSpan ValidationTimeout = TimeSpan.FromSeconds(10);

    public XiaomiFfmpegResolver(XiaomiCameraOptions options, ApiPaths paths, IHostEnvironment environment)
    {
        (ExecutablePath, Source) = Resolve(options.FfmpegPath, paths, environment);
        Validate(ExecutablePath);
    }

    public string ExecutablePath { get; }

    /// <summary>仅用于安全诊断，不包含覆盖路径或任何环境变量内容。</summary>
    public string Source { get; }

    private static (string ExecutablePath, string Source) Resolve(string? configuredPath, ApiPaths paths, IHostEnvironment environment)
    {
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            return ResolveConfiguredPath(configuredPath, "配置文件中的 Tools:FFmpeg:Path 指向的 FFmpeg 文件不存在。", "配置文件覆盖");
        }

        // 发布产物为 build/&lt;RID&gt;，工具缓存位于同级 build/tools，避免为每个 RID 重复下载。
        var bundledPath = Path.GetFullPath(Path.Combine(
            paths.Root,
            "..",
            "tools",
            "ffmpeg",
            GetRuntimeIdentifier(),
            OperatingSystem.IsWindows() ? "ffmpeg.exe" : "ffmpeg"));
        if (File.Exists(bundledPath)) return (bundledPath, "发布包内置文件");

        if (environment.IsDevelopment())
        {
            var cachedPath = Path.GetFullPath(Path.Combine(
                paths.Root, "..", "..", "build", "tools", "ffmpeg",
                GetRuntimeIdentifier(), OperatingSystem.IsWindows() ? "ffmpeg.exe" : "ffmpeg"));
            if (File.Exists(cachedPath)) return (cachedPath, "API 开发缓存");
        }

        return (OperatingSystem.IsWindows() ? "ffmpeg.exe" : "ffmpeg", "系统 PATH");
    }

    private static (string ExecutablePath, string Source) ResolveConfiguredPath(string path, string missingMessage, string source)
    {
        var fullPath = Path.GetFullPath(path);
        return !File.Exists(fullPath) ? throw new InvalidOperationException(missingMessage) : (fullPath, source);
    }

    private static string GetRuntimeIdentifier()
    {
        var operatingSystem = OperatingSystem.IsWindows() ? "win"
            : OperatingSystem.IsLinux() ? "linux"
            : OperatingSystem.IsMacOS() ? "osx"
            : throw new PlatformNotSupportedException("当前操作系统不支持内置 FFmpeg 解析。");
        var architecture = RuntimeInformation.ProcessArchitecture switch
        {
            Architecture.X64 => "x64",
            Architecture.Arm64 => "arm64",
            _ => throw new PlatformNotSupportedException("当前 CPU 架构不支持内置 FFmpeg 解析。"),
        };
        return $"{operatingSystem}-{architecture}";
    }

    private static void Validate(string executablePath)
    {
        var startInfo = new ProcessStartInfo(executablePath)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        startInfo.ArgumentList.Add("-hide_banner");
        startInfo.ArgumentList.Add("-encoders");

        try
        {
            using var process = Process.Start(startInfo)
                                ?? throw new InvalidOperationException("无法启动 FFmpeg。");
            // -encoders 的输出足以填满 Windows 管道缓冲区；必须在等待退出前开始排空两条流。
            var standardOutput = process.StandardOutput.ReadToEndAsync();
            var standardError = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit((int)ValidationTimeout.TotalMilliseconds))
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit();
                _ = standardOutput.GetAwaiter().GetResult();
                _ = standardError.GetAwaiter().GetResult();
                throw new InvalidOperationException("FFmpeg 启动预检超时。");
            }

            var output = standardOutput.GetAwaiter().GetResult() + standardError.GetAwaiter().GetResult();
            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException("FFmpeg 启动预检失败。");
            }

            // HLS 转码固定使用 libx264；启动时失败比创建播放会话后才失败更容易定位发布包问题。
            if (!output.Contains("libx264", StringComparison.Ordinal))
            {
                throw new InvalidOperationException("当前 FFmpeg 不包含必需的 libx264 编码器。请使用发布包提供的 GPL FFmpeg，或通过 Tools:FFmpeg:Path 配置含 libx264 的 FFmpeg。");
            }
        }
        catch (Win32Exception exception)
        {
            throw new InvalidOperationException(
                "未找到可用的 FFmpeg。请使用发布包内置文件、配置 Tools:FFmpeg:Path，或在系统 PATH 中安装 FFmpeg。",
                exception);
        }
    }
}
