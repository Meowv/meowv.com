# 阿星Plus

## Intro

预览：[https://meowv.com](https://meowv.com)

此个人博客项目基于 .NET Core开发，数据库为MySQL，遵循RESTful API接口规范，所有页面采用 axios 和 template-web.js 请求和加载数据，原生JavaScript操作页面，接入了 GitHub，使用GitHub账号登录后，Markdown语法编辑文章，同时也集成了各种有趣的小应用。

技术栈：.NET Core 2.2 + MySQL + WebApi + EF + Swagger + Dapper + axios + JavaScript

## TODO

- [x] 基于[.Net Core Plus](https://github.com/Meowv/.netcoreplus) 快速开发框架搭建项目
- [x] 项目配置，集成 Swagger 管理 API
- [x] 日志记录 Log4Net
- [x] Filter 之异常监听，避免直接抛出异常
- [x] Filter 之 Swagger 标签描述
- [x] 使用 Pomelo.EntityFrameworkCore.MySql + Dapper 处理数据
- [x] 核心功能API接口
- [x] 接入第三方登录,使用GitHub账号登录后台进行管理
- [x] 前台界面展示
- [x] 博客核心页面：文章列表、文章详情、分类、标签、分类下的文章列表、标签下的文章列表、友情链接
- [x] 博客小应用页面：吐个槽、个性艺术签名设计、知识库、每日热点、随机猫咪图、每日壁纸、VIP视频解析、开发记录、访问数据分析
- [x] 后台管理界面
- [x] 导入旧的Blog数据到MySQL
- [x] 免费生成个性艺术签名API
- [x] 知识库接口，收集好的文章
- [x] [Python抓取各大热门网站热门头条](https://github.com/Meowv/hotnews)，每日热点API，界面展示
- [x] 随机一张猫咪图API
- [x] 微软Bing壁纸抓取，提供API接口
- [x] 免费在线看VIP电影电视功能，各大视频网站视频解析
- [x] MTA网站数据分析
- [x] 获取Github Commits记录，提供API接口
- [ ] 抓取各大招聘网站招聘数据，根据关键词筛选进行展示查询
- [ ] 文章详情页优化
- [ ] ...

## Nuget Packages

|Package|Status|
|:------|:-----:|
|Plus|[![NuGet version](https://badge.fury.io/nu/Plus.svg)](https://badge.fury.io/nu/Plus)|
|Plus.EntityFramework |[![NuGet version](https://badge.fury.io/nu/Plus.EntityFramework.svg)](https://badge.fury.io/nu/Plus.EntityFramework )|
|Plus.AutoMapper|[![NuGet version](https://badge.fury.io/nu/Plus.AutoMapper.svg)](https://badge.fury.io/nu/Plus.AutoMapper)|
|Plus.Extensions|[![NuGet version](https://badge.fury.io/nu/Plus.Extensions.svg)](https://badge.fury.io/nu/Plus.Extensions)|
|Plus.Log4Net|[![NuGet version](https://badge.fury.io/nu/Plus.Log4Net.svg)](https://badge.fury.io/nu/Plus.Log4Net)|
|Plus.Extensions.Serialization|[![NuGet version](https://badge.fury.io/nu/Plus.Extensions.Serialization.svg)](https://badge.fury.io/nu/Plus.Extensions.Serialization)|
|Swashbuckle.AspNetCore|[![NuGet version](https://badge.fury.io/nu/Swashbuckle.AspNetCore.svg)](https://badge.fury.io/nu/Swashbuckle.AspNetCore)|
|Pomelo.EntityFrameworkCore.MySql|[![NuGet version](https://badge.fury.io/nu/Pomelo.EntityFrameworkCore.MySql.svg)](https://badge.fury.io/nu/Pomelo.EntityFrameworkCore.MySql)|
|Dapper|[![NuGet version](https://badge.fury.io/nu/Dapper.svg)](https://badge.fury.io/nu/Dapper)|
|Microsoft.AspNetCore.App|[![NuGet version](https://badge.fury.io/nu/Microsoft.AspNetCore.App.svg)](https://badge.fury.io/nu/Microsoft.AspNetCore.App)|
|Microsoft.Extensions.Logging.Debug|[![NuGet version](https://badge.fury.io/nu/Microsoft.Extensions.Logging.Debug.svg)](https://badge.fury.io/nu/Microsoft.Extensions.Logging.Debug)|
|Microsoft.VisualStudio.Web.CodeGeneration.Design|[![NuGet version](https://badge.fury.io/nu/Microsoft.VisualStudio.Web.CodeGeneration.Design.svg)](https://badge.fury.io/nu/Microsoft.VisualStudio.Web.CodeGeneration.Design)|
|Senparc.Weixin|[![NuGet version](https://badge.fury.io/nu/Senparc.Weixin.svg)](https://badge.fury.io/nu/Senparc.Weixin)|
|Senparc.Weixin.MP|[![NuGet version](https://badge.fury.io/nu/Senparc.Weixin.MP.svg)](https://badge.fury.io/nu/Senparc.Weixin.MP)|
|SixLabors.ImageSharp|[![NuGet version](https://badge.fury.io/nu/SixLabors.ImageSharp.svg)](https://badge.fury.io/nu/SixLabors.ImageSharp)|
|SixLabors.ImageSharp.Drawing|[![NuGet version](https://badge.fury.io/nu/SixLabors.ImageSharp.Drawing.svg)](https://badge.fury.io/nu/SixLabors.ImageSharp.Drawing)|
