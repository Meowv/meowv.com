using System.Security.Cryptography;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace XiaomiCamera;

/// <summary>
/// 服务启动配置。首次启动会在数据目录生成配置文件；环境变量仅用于容器化部署或一次性迁移覆盖。
/// </summary>
public sealed class XiaomiCameraOptions : IDisposable
{
    private const string ConfigPathVariable = "XIAOMI_CAMERA_CONFIG_PATH";
    private const string DataPathVariable = "XIAOMI_CAMERA_DATA_PATH";
    private const string DataKeyVariable = "XIAOMI_CAMERA_DATA_KEY";
    private const string BootstrapTokenVariable = "XIAOMI_CAMERA_BOOTSTRAP_TOKEN";
    private const string AllowedOriginsVariable = "XIAOMI_CAMERA_ALLOWED_ORIGINS";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        // 配置文件由部署者复制密钥使用；避免将 + 等字符写成 \uXXXX，造成复制后与真实密钥不一致。
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private XiaomiCameraOptions(string configPath, string dataPath, byte[] dataKey, string bootstrapToken, string[] allowedOrigins, string? ffmpegPath, bool wasCreated)
    {
        ConfigPath = configPath;
        DataPath = dataPath;
        DataKey = dataKey;
        BootstrapToken = bootstrapToken;
        AllowedOrigins = allowedOrigins;
        FfmpegPath = ffmpegPath;
        WasCreated = wasCreated;
    }

    /// <summary>当前读取的配置文件。文件中包含服务密钥，应限制为部署账户可读。</summary>
    public string ConfigPath { get; }

    public string DataPath { get; }

    /// <summary>仅供进程内 AES-GCM 使用，服务停止时会清零。</summary>
    public byte[] DataKey { get; }

    /// <summary>仅用于保护初始化与授权码轮换接口，绝不写入数据库。</summary>
    public string BootstrapToken { get; }

    /// <summary>允许跨域访问 API 的精确 Origin 列表。</summary>
    public IReadOnlyList<string> AllowedOrigins { get; }

    /// <summary>配置文件中指定的 FFmpeg 路径；环境变量可在运行时优先覆盖它。</summary>
    public string? FfmpegPath { get; }

    /// <summary>本次进程是否首次写入配置文件。</summary>
    public bool WasCreated { get; }

    public static XiaomiCameraOptions Load()
    {
        var environment = EnvironmentOverrides.Read();
        var configPath = ResolveConfigPath(environment.ConfigPath);
        var defaultDataPath = ResolveEnvironmentDataPath(environment.DataPath, configPath);
        var (file, wasCreated) = LoadOrCreate(configPath, defaultDataPath, environment);

        byte[]? dataKey = null;
        try
        {
            dataKey = DecodeDataKey(environment.DataKey ?? file.DataKey, "配置文件的 dataKey");
            var dataPath = environment.DataPath is not null
                ? ResolveEnvironmentDataPath(environment.DataPath, configPath)
                : ResolveConfiguredDataPath(file.DataPath, configPath);
            var bootstrapToken = RequireValue(
                environment.BootstrapToken ?? file.BootstrapToken,
                "配置文件的 bootstrapToken");
            var allowedOrigins = !string.IsNullOrWhiteSpace(environment.AllowedOrigins)
                ? ParseAllowedOrigins(environment.AllowedOrigins)
                : ParseAllowedOrigins(file.AllowedOrigins);
            var ffmpegPath = ResolveConfiguredOptionalPath(file.FfmpegPath, configPath);
            return new XiaomiCameraOptions(
                configPath,
                dataPath,
                dataKey,
                bootstrapToken,
                allowedOrigins,
                ffmpegPath,
                wasCreated);
        }
        catch
        {
            if (dataKey is not null)
            {
                CryptographicOperations.ZeroMemory(dataKey);
            }

            throw;
        }
    }

    public void Dispose() => CryptographicOperations.ZeroMemory(DataKey);

    private static (CameraServiceConfiguration File, bool WasCreated) LoadOrCreate(string configPath, string defaultDataPath, EnvironmentOverrides environment)
    {
        if (File.Exists(configPath))
        {
            return (ReadConfiguration(configPath), false);
        }

        // 旧版本只有数据库和环境变量。没有旧数据密钥时，绝不能生成新密钥覆盖其解密能力。
        if (File.Exists(defaultDataPath) && string.IsNullOrWhiteSpace(environment.DataKey))
        {
            throw new InvalidOperationException($"发现已有数据库 {defaultDataPath}，但未找到配置文件。请仅本次设置 {DataKeyVariable} 后重启，以生成配置文件。");
        }

        var configuration = new CameraServiceConfiguration(
            defaultDataPath,
            environment.DataKey ?? GenerateBase64(32),
            environment.BootstrapToken ?? GenerateBase64(48),
            !string.IsNullOrWhiteSpace(environment.AllowedOrigins) ? ParseAllowedOrigins(environment.AllowedOrigins) : DefaultAllowedOrigins,
            null);

        try
        {
            WriteNewConfiguration(configPath, configuration);
            return (configuration, true);
        }
        catch (IOException) when (File.Exists(configPath))
        {
            return (ReadConfiguration(configPath), false);
        }
    }

    private static CameraServiceConfiguration ReadConfiguration(string configPath)
    {
        try
        {
            RestrictConfigurationPermissions(configPath);
            var json = File.ReadAllText(configPath);
            return JsonSerializer.Deserialize<CameraServiceConfiguration>(json, JsonOptions) ?? throw new InvalidOperationException("配置文件内容为空。");
        }
        catch (JsonException exception)
        {
            throw new InvalidOperationException($"无法解析配置文件 {configPath}。", exception);
        }
    }

    private static void WriteNewConfiguration(string configPath, CameraServiceConfiguration configuration)
    {
        var directory = Path.GetDirectoryName(configPath) ?? throw new InvalidOperationException("配置文件路径必须包含目录。");
        Directory.CreateDirectory(directory);

        var json = JsonSerializer.Serialize(configuration, JsonOptions);
        using (var stream = new FileStream(configPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (var writer = new StreamWriter(stream))
        {
            writer.Write(json);
        }

        RestrictConfigurationPermissions(configPath);
    }

    private static string ResolveConfigPath(string? configuredPath) =>
        Path.GetFullPath(string.IsNullOrWhiteSpace(configuredPath)
            ? Path.Combine(ResolveStorageRoot(), "data", "xiaomi-camera.json")
            : configuredPath);

    private static string ResolveStorageRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "XiaomiCamera.csproj")))
            {
                return directory.FullName;
            }
        }

        return AppContext.BaseDirectory;
    }

    private static void RestrictConfigurationPermissions(string configPath)
    {
        if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
        {
            // 配置文件同时保存数据库密钥和部署密钥，手动编辑后也在下次启动时重新收紧权限。
            File.SetUnixFileMode(
                configPath,
                UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
    }

    private static string ResolveEnvironmentDataPath(string? configuredPath, string configPath)
    {
        if (string.IsNullOrWhiteSpace(configuredPath))
        {
            return Path.Combine(Path.GetDirectoryName(configPath)!, "xiaomi-camera.db");
        }

        // 兼容旧环境变量：相对路径仍以进程工作目录为基准。
        return Path.GetFullPath(configuredPath);
    }

    private static string ResolveConfiguredDataPath(string? configuredPath, string configPath)
    {
        if (string.IsNullOrWhiteSpace(configuredPath))
        {
            throw new InvalidOperationException("配置文件的 dataPath 不能为空。");
        }

        return Path.IsPathRooted(configuredPath) ? Path.GetFullPath(configuredPath) : Path.GetFullPath(Path.Combine(Path.GetDirectoryName(configPath)!, configuredPath));
    }

    private static string? ResolveConfiguredOptionalPath(string? configuredPath, string configPath)
    {
        if (string.IsNullOrWhiteSpace(configuredPath))
        {
            return null;
        }

        return Path.IsPathRooted(configuredPath)
            ? Path.GetFullPath(configuredPath)
            : Path.GetFullPath(Path.Combine(Path.GetDirectoryName(configPath)!, configuredPath));
    }

    private static byte[] DecodeDataKey(string? encodedKey, string source)
    {
        var value = RequireValue(encodedKey, source);
        try
        {
            var dataKey = Convert.FromBase64String(value);
            if (dataKey.Length == 32)
            {
                return dataKey;
            }

            CryptographicOperations.ZeroMemory(dataKey);
        }
        catch (FormatException exception)
        {
            throw new InvalidOperationException($"{source} 必须是 Base64 编码。", exception);
        }

        throw new InvalidOperationException($"{source} 必须解码为 32 字节密钥。");
    }

    private static string RequireValue(string? value, string source) => !string.IsNullOrWhiteSpace(value) ? value : throw new InvalidOperationException($"{source} 不能为空。");

    private static string[] ParseAllowedOrigins(IEnumerable<string>? values)
    {
        var origins = (values ?? []).Select(NormalizeOrigin).Distinct(StringComparer.Ordinal).ToArray();
        return origins.Length > 0 ? origins : throw new InvalidOperationException("allowedOrigins 至少需要一个有效 Origin。");
    }

    private static string[] ParseAllowedOrigins(string values) => ParseAllowedOrigins(values.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries));

    private static string NormalizeOrigin(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var origin) ||
            (origin.Scheme != Uri.UriSchemeHttp && origin.Scheme != Uri.UriSchemeHttps) ||
            !string.Equals(value.TrimEnd('/'), origin.GetLeftPart(UriPartial.Authority), StringComparison.Ordinal))
        {
            throw new InvalidOperationException("allowedOrigins 仅允许不含路径的 http 或 https Origin。");
        }

        return origin.GetLeftPart(UriPartial.Authority);
    }

    private static string GenerateBase64(int length)
    {
        var bytes = RandomNumberGenerator.GetBytes(length);
        try
        {
            return Convert.ToBase64String(bytes);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    private static readonly string[] DefaultAllowedOrigins =
    [
        "http://127.0.0.1:4001",
        "http://localhost:4001",
    ];

    private sealed record CameraServiceConfiguration(string? DataPath, string? DataKey, string? BootstrapToken, string[]? AllowedOrigins, string? FfmpegPath);

    private sealed record EnvironmentOverrides(string? ConfigPath, string? DataPath, string? DataKey, string? BootstrapToken, string? AllowedOrigins)
    {
        public static EnvironmentOverrides Read() => new(
            Environment.GetEnvironmentVariable(ConfigPathVariable),
            Environment.GetEnvironmentVariable(DataPathVariable),
            Environment.GetEnvironmentVariable(DataKeyVariable),
            Environment.GetEnvironmentVariable(BootstrapTokenVariable),
            Environment.GetEnvironmentVariable(AllowedOriginsVariable));
    }
}