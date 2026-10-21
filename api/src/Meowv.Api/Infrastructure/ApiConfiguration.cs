namespace Meowv.Api.Infrastructure;

public static class ApiConfiguration
{
    public static WebApplicationBuilder CreateBuilder(string[] args)
    {
        var host = new ConfigurationBuilder()
            .AddEnvironmentVariables("ASPNETCORE_")
            .AddEnvironmentVariables("DOTNET_")
            .AddCommandLine(args).Build();

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = Path.GetFullPath(host["contentRoot"] ?? AppContext.BaseDirectory),
        });
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddConfiguration(host).AddJsonFile("appsettings.json", optional: false, reloadOnChange: false);

        builder.Configuration.AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: false);
        builder.Configuration.AddEnvironmentVariables().AddCommandLine(args);
        return builder;
    }
}

public sealed class ApiPaths(IHostEnvironment environment)
{
    public string Root { get; } = environment.ContentRootPath;
    public string Resolve(string path) => Path.GetFullPath(path, Root);
}

public sealed class ApiCorsOptions
{
    public string[] AllowedOrigins { get; set; } = [];

    public static bool IsValid(ApiCorsOptions options) => options.AllowedOrigins.All(value =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        uri.Scheme is "http" or "https" &&
        string.Equals(value.TrimEnd('/'), uri.GetLeftPart(UriPartial.Authority), StringComparison.Ordinal));
}

public sealed class FfmpegOptions
{
    public string? Path { get; set; }
}