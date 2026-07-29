---
title: .NET Core 下使用 Serilog 记录日志
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-09-21 08:49:21
categories: .NET
tags:
  - .NET Core
  - Serilog
  - 日志
---

## Serilog

::: tip Why Serilog?
Like many other libraries for .NET, Serilog provides diagnostic logging to files, the console, and elsewhere. It is easy to set up, has a clean API, and is portable between recent .NET platforms.

Unlike other logging libraries, Serilog is built with powerful structured event data in mind.
:::

## 最佳实践

### 控制台项目

在项目中添加下面几个组件包

```powershell
Install-Package Serilog.Extensions.Logging
Install-Package Serilog.Sinks.Console
Install-Package Serilog.Sinks.File
```

```csharp
class Program
{
    static async Task Main(string[] args)
    {
        Log.Logger = new LoggerConfiguration()
           .MinimumLevel.Information()
           .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
#if DEBUG
            .MinimumLevel.Override("Xxx", LogEventLevel.Debug)
#else
            .MinimumLevel.Override("Xxx", LogEventLevel.Information)
#endif
           .Enrich.FromLogContext()
           .WriteTo.File(Path.Combine(Directory.GetCurrentDirectory(), "Logs/logs.txt"))
           .WriteTo.Console()
           .CreateLogger();

        await CreateHostBuilder(args).RunConsoleAsync();
    }

    public static IHostBuilder CreateHostBuilder(string[] args) =>
        Host.CreateDefaultBuilder(args)
            .ConfigureLogging((context, logging) => logging.ClearProviders())
            .ConfigureServices((hostContext, services) =>
            {
                services.AddHostedService<XxxHostedService>();
            });
}
```

```csharp
//XxxHostedService.cs
public class XxxHostedService : IHostedService
{
    private readonly IHostApplicationLifetime _hostApplicationLifetime;

    public XxxHostedService(IHostApplicationLifetime hostApplicationLifetime)
    {
        _hostApplicationLifetime = hostApplicationLifetime;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var application = AbpApplicationFactory.Create<XxxModule>(options =>
        {
            options.UseAutofac();
            options.Services.AddLogging(c => c.AddSerilog());
        });
        application.Initialize();

        var service = await application.ServiceProvider.GetRequiredService<XxxService>();
        service.XxxAsync();

        application.Shutdown();

        _hostApplicationLifetime.StopApplication();
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
```

### AspNetCore 项目

在项目中添加下面几个组件包

```powershell
Install-Package Serilog.AspNetCore
Install-Package Serilog.Sinks.Async
Install-Package Serilog.Sinks.File
```

```csharp
public static async Task Main(string[] args)
{
    Log.Logger = new LoggerConfiguration()
#if DEBUG
        .MinimumLevel.Debug()
#else
        .MinimumLevel.Information()
#endif
        .MinimumLevel.Override("Microsoft", LogEventLevel.Information)
        .Enrich.FromLogContext()
        .WriteTo.Async(c => c.File($"Logs/{DateTime.Now:yyyy/MMdd}/logs.txt"))
        .CreateLogger();

        try
        {
            Log.Information("Starting Xxx.");

            await CreateHostBuilder(args).Build().RunAsync();
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "Xxx terminated unexpectedly!");
        }
        finally
        {
            Log.CloseAndFlush();
        }
    }

    internal static IHostBuilder CreateHostBuilder(string[] args) =>
        Host.CreateDefaultBuilder(args)
            .ConfigureWebHostDefaults(webBuilder =>
            {
                webBuilder.UseIISIntegration()
                          .UseStartup<Startup>();
            }).UseAutofac().UseSerilog();
}
```
