---
title: .NET Core 下使用 gRPC
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-09-14 08:59:14
categories: .NET
tags:
  - .NET Core
  - GRPC
---

gRPC 是一种与语言无关的高性能远程过程调用 (RPC) 框架。

- <https://grpc.io/docs/guides/>
- <https://github.com/grpc/grpc-dotnet>
- <https://docs.microsoft.com/zh-cn/aspnet/core/grpc>

::: tip gRPC 的主要优点

- 现代高性能轻量级 RPC 框架。
- 协定优先 API 开发，默认使用协议缓冲区，允许与语言无关的实现。
- 可用于多种语言的工具，以生成强类型服务器和客户端。
- 支持客户端、服务器和双向流式处理调用。
- 使用 Protobuf 二进制序列化减少对网络的使用。

:::

::: tip 这些优点使 gRPC 适用于

- 效率至关重要的轻量级微服务。
- 需要多种语言用于开发的 Polyglot 系统。
- 需要处理流式处理请求或响应的点对点实时服务。

:::

gRPC 现在可以非常简单的在 .NET Core 和 ASP.NET Core 中使用，并且已经开源，它目前由微软官方 ASP.NET 项目的人员进行维护，良好的接入 .NET Core 生态。

接下来演示如何使用 gRPC，要想使用 gRPC 需要 .NET Core 3.1 或者以上的 SDK 支持。gRPC 分服务端和客户端，所以新建两个项目，一个控制台当作客户端`gRPC_ClientDemo`，一个 ASP.NET Core 项目当作服务端`gRPC_ServerDemo`。

先将服务端搞定，添加`Grpc.AspNetCore`组件

```PowerShell
Install-Package Grpc.AspNetCore
```

然后`Startup.cs`中添加`services.AddGrpc()`。

```csharp
public void ConfigureServices(IServiceCollection services)
{
    services.AddGrpc();
}
```

因为 gRPC 是基于 HTTP/2 来通信的，所以需要在配置文件中添加 Kestrel 启用 HTTP/2 的配置。

```json
{
  "Kestrel": {
    "EndpointDefaults": {
      "Protocols": "Http2"
    }
  }
}
```

gRPC 与传统的 api 是不同的，需要我们自己定义`proto`文件，gRPC 使用协定优先方法进行 API 开发。 默认情况下，协议缓冲区 (protobuf) 用作接口设计语言 (IDL)。 \*.proto 文件包含：

- gRPC 服务的定义。
- 在客户端与服务器之间发送的消息。

有关 protobuf 文件的语法的详细信息，可以查看官方文档 ([protobuf](https://developers.google.com/protocol-buffers/docs/proto3))。

`proto`文件在实际开发中肯定会有多个存在，这里有一个技巧就是将`proto`文件放在一个文件夹内，然后利用`Protobuf`的`Link`关联即可，这样就只用维护一份`proto`文件即可。

同时微软还帮我们提供了`dotnet-grpc`，.NET Core 全局工具，请运行以下命令：

```bash
dotnet tool install -g dotnet-grpc
```

`dotnet-grpc` 可以用于将 `Protobuf` 引用作为 `<Protobuf />` 项添加到 .csproj 文件：

```xml
<Protobuf Include="Protos\greet.proto" GrpcServices="Server" />
```

具体用法可以查看文档：<https://docs.microsoft.com/zh-cn/aspnet/core/grpc/dotnet-grpc>

在解决访问文件夹根目录添加 Proto 文件夹，新建一个`hello.proto`proto 文件，将其分别连接到两个项目中。

![ ](/images/dotnet/grpc-in-dotnet-01.png)

现在来开始编写`hello.proto`，添加一个`SayHello`方法。

```csharp
syntax = "proto3";

package hello; //定义包名

// 定义服务
service HelloService {
    // 定义一个 SayHello 方法
    rpc SayHello (HelloRequest) returns (HelloReply);
}

message HelloRequest {
    string name = 1;
}

message HelloReply {
    string message = 1;
}
```

然后来实现这个服务，在服务端添加一个`GreeterService.cs`。

```csharp
using Grpc.Core;
using Hello;
using Microsoft.Extensions.Logging;
using System.Threading.Tasks;

namespace gRPC_ServerDemo.Services
{
    public class GreeterService : HelloService.HelloServiceBase
    {
        private readonly ILogger _logger;

        public GreeterService(ILoggerFactory loggerFactory)
        {
            _logger = loggerFactory.CreateLogger<GreeterService>();
        }

        public override Task<HelloReply> SayHello(HelloRequest request, ServerCallContext context)
        {
            _logger.LogInformation($"Sending hello to {request.Name}");

            return Task.FromResult(new HelloReply { Message = "Hello " + request.Name });
        }
    }
}
```

`HelloService.HelloServiceBase`是`proto`文件为我们自动生成的类。

![ ](/images/dotnet/grpc-in-dotnet-02.png)

调用重载方法`SayHello()`，记录了一条日志然后返回客户端传进来的字段 name。

在配置文件中将`GreeterService`服务添加到路由管道中

```csharp
app.UseEndpoints(endpoints =>
{
    endpoints.MapGet("/", async context =>
    {
        await context.Response.WriteAsync("Hello World!");
    });

    endpoints.MapGrpcService<GreeterService>();
});
```

支持我们服务端完成，启动服务端拿到启动地址，<https://localhost:5001>。

现在去客户端配置地址调用我们写的服务，在开始之前需要在客户端解决方案先引用下面几个 nuget 包。

```PowerShell
Install-Package Grpc.Net.Client
Install-Package Google.Protobuf
Install-Package Grpc.Tools
```

```csharp
using Grpc.Net.Client;
using Hello;
using System;
using System.Threading.Tasks;

namespace gRPC_ClientDemo
{
    class Program
    {
        static async Task Main(string[] args)
        {
            using var channel = GrpcChannel.ForAddress("https://localhost:5001");

            var client = new HelloService.HelloServiceClient(channel);

            await UnaryCallExample(client);
        }

        private static async Task UnaryCallExample(HelloService.HelloServiceClient client)
        {
            var reply = await client.SayHelloAsync(new HelloRequest { Name = "阿星Plus" });

            Console.WriteLine("Greeting: " + reply.Message);
        }
    }
}
```

启动服务端和客户端看看效果，成功发送消息和获取消息。

![ ](/images/dotnet/grpc-in-dotnet-03.png)
