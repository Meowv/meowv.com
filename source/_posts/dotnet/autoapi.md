---
title: 动态 Restful API 生成
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-09-03 08:53:02
categories: .NET
tags:
  - .NET Core
  - WebApi
---

## 介绍

通常在 DDD 开发架构中，我们写完服务层需要在控制器中写 API，今天介绍一个组件 `Plus.AutoApi` 可以用它来动态生成 Restful 风格的 WebApi，不用写 Controller。

## 快速使用

在你的应用服务层中添加组件

```PowerShell
Install-Package Plus.AutoApi
```

在 Startup 中注册 AutoApi

```csharp
public void ConfigureServices(IServiceCollection services)
{
    services.AddAutoApi(x => { });
}
```

`AddAutoApi` 同时也支持各种 Options 参数，可以自行查看。

让你的服务直接或者间接实现`IAutoApi`，添加特性`[AutoApi]`即可，示例代码如下：

```csharp
[AutoApi]
public class WeatherService : IAutoApi
{
    private static readonly string[] Summaries = new[]
    {
        "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
    };

    public IEnumerable<WeatherForecast> Get()
    {
        return WeatherForecast();
    }

    [HttpGet("{id}")]
    public IEnumerable<WeatherForecast> Get(int id)
    {
        return WeatherForecast();
    }

    public IEnumerable<WeatherForecast> Post()
    {
        return WeatherForecast();
    }

    [HttpPut("{id}")]
    public IEnumerable<WeatherForecast> Put(int id)
    {
        return WeatherForecast();
    }

    [HttpDelete("{id}")]
    public IEnumerable<WeatherForecast> Delete(int id)
    {
        return WeatherForecast();
    }

    private static IEnumerable<WeatherForecast> WeatherForecast()
    {
        var rng = new Random();
        return Enumerable.Range(1, 5).Select(index => new WeatherForecast
        {
            Date = DateTime.Now.AddDays(index),
            TemperatureC = rng.Next(-20, 55),
            Summary = Summaries[rng.Next(Summaries.Length)]
        }).ToArray();
    }
}
```

需要注意的是你的服务层命名规范，默认要以`Service`或者`ApplicationService`结尾，也可以通过配置替换默认名称。

如果你想让某个服务不自动生成 API，可以给特性传递参数：`[AutoApi(Disabled = true)]`

让生成的 API 兼容 Swagger，需要添加下面这句代码。

```csharp {8}
services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Plus AutoApi Sample",
        Version = "v1.0.0"
    });
    options.DocInclusionPredicate((docName, description) => true);
});
```

同时自动生成 API 也可以和控制器共存，互不影响。你可以手动指定 HTTP 方法，也可以根据默认规则自动创建。

默认自动创建 HTTP 方法的规则如下：

```csharp
static PlusConsts()
{
    HttpVerbs = new Dictionary<string, string>()
    {
        ["add"] = "POST",
        ["create"] = "POST",
        ["post"] = "POST",
        ["insert"] = "POST",
        ["get"] = "GET",
        ["find"] = "GET",
        ["fetch"] = "GET",
        ["query"] = "GET",
        ["update"] = "PUT",
        ["put"] = "PUT",
        ["delete"] = "DELETE",
        ["remove"] = "DELETE"
    };
}
```

上面代码最终生成的 API 路由如下：

![ ](/images/dotnet/autoapi-01.png)

## Samples

<https://github.com/Meowv/Plus.AutoApi/tree/master/samples/Plus.AutoApi.Sample>

## Nuget

<https://www.nuget.org/packages/Plus.AutoApi>

## 开源地址

<https://github.com/Meowv/Plus.AutoApi>
