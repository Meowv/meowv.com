---
title: EPPlus.Core 处理 Excel 报错之天坑 WPS
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-08-21 11:00:21
categories: .NET
tags:
  - .NET Core
  - EPPlus
  - Excel
---

最近工作中常常有有数据处理的需求，一个 Excel 动不动就是上十万的数据量，在用 EPPlus.Core 导入数据入库的时候遇到了一个莫名其妙的问题 `The given key 'rId2' was not present in the dictionary.`

我 TM 一个导入 Excel，解析数据哪里来的 dictionary???

然后开始了艰辛的调试 debug 之旅，反复上传导入都不行，然后自己创建了一个格式相同数据量比较少的 Excel 文件上传，成功。

这时候我大概知道是什么问题了，给 Excel 数据的同事用的是 WPS，由于 EPPlus 对 WPS 支持度不怎么友好，所以导致解析数据的时候出错，将 WPS 保存的 Excel 文件用 Office Excel 打开另存为一个新的文件，再上传解析，成功。

```csharp
public async Task<ActionOutput> ProcessExcelData(IFormFile ExcelFile)
{
    using (var package = new ExcelPackage(ExcelFile.OpenReadStream()))
    {
        var sheet = package.Workbook.Worksheets.First();

        ...

        return new ActionOutput();
    }
}
```
