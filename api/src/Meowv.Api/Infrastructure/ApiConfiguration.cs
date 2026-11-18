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