---
title: .NET Core 下的 API 网关
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-09-28 08:42:28
categories: .NET
tags:
  - .NET Core
  - ApiGateway
---

![ ](/images/dotnet/api-gateway-01.png)

## 网关介绍

网关其实就是将我们写好的 API 全部放在一个统一的地址暴露在公网，提供访问的一个入口。在 .NET Core 下可以使用`Ocelot`来帮助我们很方便的接入 API 网关。与之类似的库还有[`ProxyKit`](https://github.com/proxykit/ProxyKit)，微软也发布了一个反向代理的库[`YARP`](https://github.com/microsoft/reverse-proxy)。

关于网关的介绍不多说了，网上文章也挺多的，这些都是不错的选择，听说后期`Ocelot`将会使用`YARP`来重写。本篇主要实践一下在.NET Core 环境下使用`Ocelot`。

- Ocelot 官网：<https://threemammals.com/ocelot>
- Ocelot 文档：<https://ocelot.readthedocs.io>
- GitHub：<https://github.com/ThreeMammals/Ocelot>
- Ocelot 资源汇总：<https://www.cnblogs.com/shanyou/p/10363360.html>

## 接入使用

### 接口示例

先创建几个项目用于测试，创建两个默认的 API 项目，Api_A 和 Api_B，在创建一个网关项目 Api_Gateway，网关项目可以选择空的模板。

现在分别在 Api_A 和 Api_B 中写几个 api，将默认的`WeatherForecastController`中返回模型`WeatherForecast`添加一个字段 Source，用于区分是哪个 API 返回的数据。

```csharp
using System;

namespace Api_A
{
    public class WeatherForecast
    {
        public string Source { get; set; } = "Api_A";

        public DateTime Date { get; set; }

        public int TemperatureC { get; set; }

        public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);

        public string Summary { get; set; }
    }
}

using System;

namespace Api_B
{
    public class WeatherForecast
    {
        public string Source { get; set; } = "Api_B";

        public DateTime Date { get; set; }

        public int TemperatureC { get; set; }

        public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);

        public string Summary { get; set; }
    }
}
```

直接使用`WeatherForecastController`默认方法，在路由中添加 api 前缀。

```csharp
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Api_A.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class WeatherForecastController : ControllerBase
    {
        private static readonly string[] Summaries = new[]
        {
            "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
        };

        [HttpGet]
        public IEnumerable<WeatherForecast> Get()
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
}

using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Api_B.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class WeatherForecastController : ControllerBase
    {
        private static readonly string[] Summaries = new[]
        {
            "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
        };

        [HttpGet]
        public IEnumerable<WeatherForecast> Get()
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
}
```

再分别在 Api_A 和 Api_B 中添加两个控制器：ApiAController、ApiBController，然后加上几个简单的 restful api。

```csharp
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;

namespace Api_A.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ApiAController : ControllerBase
    {
        [HttpGet]
        public IEnumerable<string> Get()
        {
            return new string[] { "value1", "value2" };
        }

        [HttpGet("{id}")]
        public string Get(int id)
        {
            return $"Get：{id}";
        }

        [HttpPost]
        public string Post([FromForm] string value)
        {
            return $"Post:{value}";
        }

        [HttpPut("{id}")]
        public string Put(int id, [FromForm] string value)
        {
            return $"Put:{id}:{value}";
        }

        [HttpDelete("{id}")]
        public string Delete(int id)
        {
            return $"Delete:{id}";
        }
    }
}
```

```csharp
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;

namespace Api_B.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ApiBController : ControllerBase
    {
        [HttpGet]
        public IEnumerable<string> Get()
        {
            return new string[] { "value1", "value2" };
        }

        [HttpGet("{id}")]
        public string Get(int id)
        {
            return $"Get：{id}";
        }

        [HttpPost]
        public string Post([FromForm] string value)
        {
            return $"Post:{value}";
        }

        [HttpPut("{id}")]
        public string Put(int id, [FromForm] string value)
        {
            return $"Put:{id}:{value}";
        }

        [HttpDelete("{id}")]
        public string Delete(int id)
        {
            return $"Delete:{id}";
        }
    }
}
```

![ ](/images/dotnet/api-gateway-02.png)
![ ](/images/dotnet/api-gateway-03.png)

方便查看接口，这里添加一下`swagger`组件，这样我们 Api_A 和 Api_B 项目分别就有了 6 个接口。

接着打包 docker 镜像，放在 docker 中运行这两个 api 项目。这一步可以用任何你熟悉的方式，run 起来即可。

```bash
docker build -t api_a:dev -f ./Api_A/Dockerfile .
docker build -t api_b:dev -f ./Api_B/Dockerfile .
```

build 成功后，指定两个端口运行 api 项目。

```powershell
docker run -d -p 5050:80 --name api_a api_a:dev
docker run -d -p 5051:80 --name api_b api_b:dev
```

Api_A 指定了 5050 端口，通过 <http://localhost:5050/swagger>打开可以看到 swagger 文档界面，Api_B 指定了 5051 端口，通过 <http://localhost:5051/swagger>打开可以看到 swagger 文档界面，这样就大功告成了，接下来才是重点将两个 api 项目配置到 Api_Gateway 网关项目中。

### 配置网关

在网关项目 Api_Gateway 中都添加`Ocelot`组件包。

```powershell
Install-Package Ocelot
```

`Ocelot`中最关键的就是配置路由信息，新建一个`ocelot.json`配置文件，将我们的两个 API 接口匹配规则放进去。

```json
{
  "Routes": [
    //ApiA
    {
      "DownstreamPathTemplate": "/api/WeatherForecast",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        {
          "Host": "localhost",
          "Port": 5050
        }
      ],
      "UpstreamPathTemplate": "/ApiA/WeatherForecast",
      "UpstreamHttpMethod": ["Get"]
    },
    {
      "DownstreamPathTemplate": "/api/ApiA",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        {
          "Host": "localhost",
          "Port": 5050
        }
      ],
      "UpstreamPathTemplate": "/ApiA",
      "UpstreamHttpMethod": ["Get", "POST"]
    },
    {
      "DownstreamPathTemplate": "/api/ApiA/{id}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        {
          "Host": "localhost",
          "Port": 5050
        }
      ],
      "UpstreamPathTemplate": "/ApiA/{id}",
      "UpstreamHttpMethod": ["Get", "Put", "Delete"]
    },
    //ApiB
    {
      "DownstreamPathTemplate": "/api/WeatherForecast",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        {
          "Host": "localhost",
          "Port": 5051
        }
      ],
      "UpstreamPathTemplate": "/ApiB/WeatherForecast",
      "UpstreamHttpMethod": ["Get"]
    },
    {
      "DownstreamPathTemplate": "/api/ApiB",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        {
          "Host": "localhost",
          "Port": 5051
        }
      ],
      "UpstreamPathTemplate": "/ApiB",
      "UpstreamHttpMethod": ["Get", "POST"]
    },
    {
      "DownstreamPathTemplate": "/api/ApiB/{id}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        {
          "Host": "localhost",
          "Port": 5051
        }
      ],
      "UpstreamPathTemplate": "/ApiB/{id}",
      "UpstreamHttpMethod": ["Get", "Put", "Delete"]
    }
  ],
  "GlobalConfiguration": {
    "BaseUrl": "https://localhost:44335"
  }
}
```

关于配置文件中的各项具体含义，可以参考官方文档中的介绍。主要就是将 DownstreamPathTemplate 模板内容转换为 UpstreamPathTemplate 模板内容进行接口的访问，同时可以指定 HTTP 请求的方式等等。GlobalConfiguration 中的 BaseUrl 为我们暴漏出去的网关地址。

设置好`ocelot.json`后，需要在代码中使用它，在`Program.cs`中添加配置文件。

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Api_Gateway
{
    public class Program
    {
        public static void Main(string[] args)
        {
            CreateHostBuilder(args).Build().Run();
        }

        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureAppConfiguration((context, config) =>
                {
                    config.AddJsonFile("ocelot.json", optional: false, reloadOnChange: true);
                })
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder.UseStartup<Startup>();
                });
    }
}
```

在`Startup.cs`中使用`Ocelot`。

```csharp
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Ocelot.DependencyInjection;
using Ocelot.Middleware;

namespace Api_Gateway
{
    public class Startup
    {
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddOcelot();
        }

        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            app.UseRouting();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapGet("/", async context =>
                {
                    await context.Response.WriteAsync("Hello World!");
                });
            });

            app.UseOcelot().Wait();
        }
    }
}
```

完成以上操作后，我们试着去调用接口看看能否正确获取预期数据。

```bash
curl -X GET "https://localhost:44335/ApiA"
curl -X GET "https://localhost:44335/ApiB"

curl -X POST "https://localhost:44335/ApiA" -H "Content-Type: multipart/form-data" -F "value=ApiA"
curl -X POST "https://localhost:44335/ApiB" -H "Content-Type: multipart/form-data" -F "value=ApiB"

curl -X GET "https://localhost:44335/ApiA/12345"
curl -X GET "https://localhost:44335/ApiB/12345"

curl -X PUT "https://localhost:44335/ApiA/12345" -H "Content-Type: multipart/form-data" -F "value=ApiA"
curl -X PUT "https://localhost:44335/ApiB/12345" -H "Content-Type: multipart/form-data" -F "value=ApiB"

curl -X DELETE "https://localhost:44335/ApiA/12345"
curl -X DELETE "https://localhost:44335/ApiB/12345"

curl -X GET "https://localhost:44335/ApiA/WeatherForecast"
curl -X GET "https://localhost:44335/ApiB/WeatherForecast"
```

![ ](/images/dotnet/api-gateway-04.png)

可以看到，两个项目中的接口全部可以通过网关项目暴露的地址进行中转，是不是很方便？

本篇只是简单的应用，对于`Ocelot`的功能远不止于此，它非常强大，还可以实现请求聚合、服务发现、认证、鉴权、限流熔断、并内置了负载均衡器，而且这些功能都是只需要简单的配置即可完成。就不一一描述了，如有实际开发需求和问题，可以查看官方文档和示例。
