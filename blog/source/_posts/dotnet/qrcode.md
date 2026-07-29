---
title: .NET Core 生成二维码
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-09-07 09:16:07
categories: .NET
tags:
  - .NET Core
  - QRCoder
---

二维码的生成有好多种方式，本篇将使用`QRCoder`来实现，小巧易用，支持并发生成，不依赖第三方库。

开源地址：<https://github.com/codebude/QRCoder>

先在项目中添加组件

```PowerShell
Install-Package QRCoder
```

然后添加一个生成二维码的接口，并且实现

```csharp
using QRCoder;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public interface IQRCode
{
    byte[] GenerateQRCode(string content);
}

public class QRCode : IQRCode
{
    public byte[] GenerateQRCode(string content)
    {
        var generator = new QRCodeGenerator();

        var codeData = generator.CreateQrCode(content, QRCodeGenerator.ECCLevel.M, true);
        QRCoder.QRCode qrcode = new QRCoder.QRCode(codeData);

        var bitmapImg = qrcode.GetGraphic(10, Color.Black, Color.White, false);

        using MemoryStream stream = new MemoryStream();
        bitmapImg.Save(stream, ImageFormat.Jpeg);
        return stream.GetBuffer();
    }
}
```

`qrcode.GetGraphic(...)`默认返回了`Bitmap`类型，这里处理成了`byte[]`。

`qrcode.GetGraphic(...)`方法参数简单说明，可以根据开发时候的注释说明进一步了解。

```csharp
public Bitmap GetGraphic(int pixelsPerModule, Color darkColor, Color lightColor, Bitmap icon = null, int iconSizePercent = 15, int iconBorderWidth = 6, bool drawQuietZones = true)
{
    // int pixelsPerModule 生成二维码图片的像素大小
    // Color darkColor 暗色 一般设置为Color.Black 黑色
    // Color lightColor 亮色 一般设置为Color.White 白色
    // Bitmap icon 二维码水印图标 例如：Bitmap icon = new Bitmap(context.Server.MapPath("~/images/zs.png"));默认为NULL ，加上这个二维码中间会显示一个图标
    // int iconSizePercent 水印图标的大小比例 ，可根据自己的喜好设置
    // int iconBorderWidth 水印图标的边框
    // bool drawQuietZones 静止区，位于二维码某一边的空白边界,用来阻止读者获取与正在浏览的二维码无关的信息，即是否绘画二维码的空白边框区域 默认为true
}
```

在控制器中注入调用

```csharp
using Microsoft.AspNetCore.Mvc;

[Route("api/[controller]")]
[ApiController]
public class QrCodeController : ControllerBase
{
    [HttpGet]
    public FileContentResult QrCode([FromServices] IQRCode _qrcode, string content)
    {
        var buffer = _qrcode.GenerateQRCode(content);

        return File(buffer, "image/jpeg");
    }
}
```

`QRCoder`会根据 content 的内容来生成对应的二维码，如果传入的是纯文本，则返回文本内容，如果传入的是一个标准的 URL，则扫描二维码的时候会直接打开链接，还是很方便人性化的。

![ ](/images/dotnet/qrcode-01.png)
