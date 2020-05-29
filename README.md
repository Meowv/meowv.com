# 😍阿星Plus⭐⭐⭐

## 项目介绍

此版本个人博客项目底层基于 [ABP Framework](http://abp.io/) (不完全依赖)搭建项目 和免费开源跨平台的 .NET Core 3.1 开发，可作为 .NET Core 入门项目进行学习，支持各种主流数据库(SqlServer、MySQL、PostgreSql、Sqlite)，接口遵循 RESTful API 接口规范，前端所有页面采用 axios 和 template-web.js 请求和加载数据，原生JavaScript操作页面。

If you liked `Blog` project or if it helped you, please give a star ⭐️ for this repository. 👍👍👍

## 系列文章

> **[基于 abp vNext 和 .NET Core 开发博客项目 - 微信项目实战专辑](https://mp.weixin.qq.com/mp/appmsgalbum?action=getalbum&__biz=MzUzNzk0MDQ5MA==&scene=1&album_id=1345555337696477185)**

1. [基于 abp vNext 和 .NET Core 开发博客项目 - 使用 abp cli 搭建项目](https://www.cnblogs.com/meowv/p/12896177.html)
2. [基于 abp vNext 和 .NET Core 开发博客项目 - 给项目瘦身，让它跑起来](https://www.cnblogs.com/meowv/p/12896898.html)
3. [基于 abp vNext 和 .NET Core 开发博客项目 - 完善与美化，Swagger登场](https://www.cnblogs.com/meowv/p/12909558.html)
4. [基于 abp vNext 和 .NET Core 开发博客项目 - 数据访问和代码优先](https://www.cnblogs.com/meowv/p/12913676.html)
5. [基于 abp vNext 和 .NET Core 开发博客项目 - 自定义仓储之增删改查](https://www.cnblogs.com/meowv/p/12916613.html)
6. [基于 abp vNext 和 .NET Core 开发博客项目 - 统一规范API，包装返回模型](https://www.cnblogs.com/meowv/p/12924409.html)
7. [基于 abp vNext 和 .NET Core 开发博客项目 - 再说Swagger，分组、描述、小绿锁](https://www.cnblogs.com/meowv/p/12924859.html)
8. [基于 abp vNext 和 .NET Core 开发博客项目 - 接入GitHub，用JWT保护你的API](https://www.cnblogs.com/meowv/p/12935693.html)
9. [基于 abp vNext 和 .NET Core 开发博客项目 - 异常处理和日志记录](https://www.cnblogs.com/meowv/p/12943699.html)
10. [基于 abp vNext 和 .NET Core 开发博客项目 - 使用Redis缓存数据](https://www.cnblogs.com/meowv/p/12956696.html)
11. [基于 abp vNext 和 .NET Core 开发博客项目 - 集成Hangfire实现定时任务处理](https://www.cnblogs.com/meowv/p/12961014.html)
12. [基于 abp vNext 和 .NET Core 开发博客项目 - 用AutoMapper搞定对象映射](https://www.cnblogs.com/meowv/p/12966092.html)
13. [基于 abp vNext 和 .NET Core 开发博客项目 - 定时任务最佳实战（一）](https://www.cnblogs.com/meowv/p/12971041.html)
14. [基于 abp vNext 和 .NET Core 开发博客项目 - 定时任务最佳实战（二）](https://www.cnblogs.com/meowv/p/12974439.html)
15. [基于 abp vNext 和 .NET Core 开发博客项目 - 定时任务最佳实战（三）](https://www.cnblogs.com/meowv/p/12980301.html)

```tree
Blog ---------- root
 ├── .dockerignore ---------- docker ignore
 ├── .gitattributes ---------- git attributes
 ├── .gitignore ---------- git ignore
 ├── common.props ---------- common.props
 ├── LICENSE ---------- LICENSE
 ├── Meowv.Blog.sln ---------- Solution
 ├── README.md ---------- README.md
 ├── .github ---------- github config
 ├── src
 │   ├── Meowv.Blog.Application ---------- 应用服务层
 │   ├── Meowv.Blog.Application.Caching ---------- 应用服务缓存
 │   ├── Meowv.Blog.Application.Contracts ---------- 应用服务数据传输对象(DTO)
 │   ├── Meowv.Blog.BackgroundJobs ---------- 后台定时任务
 │   ├── Meowv.Blog.Domain ---------- 领域层，实体，仓储接口
 │   ├── Meowv.Blog.Domain.Shared ---------- 领域层，一些常量，枚举等
 │   ├── Meowv.Blog.EntityFrameworkCore ---------- 集成EF Core，仓储接口实现
 │   ├── Meowv.Blog.EntityFrameworkCore.DbMigrations ---------- EF Core数据库迁移
 │   ├── Meowv.Blog.HttpApi ---------- API控制器
 │   ├── Meowv.Blog.HttpApi.Hosting ---------- WebApi项目，依赖于HttpApi，
 │   ├── Meowv.Blog.Swagger ---------- Swagger扩展、Filter
 │   └── Meowv.Blog.ToolKits ---------- 公共的工具类、扩展方法
 └── static ---------- 用于README.md展示图片的图片文件夹
```

## 技术栈

ABP Framework + .NET Core 3.1 + Docker + Nginx + Redis + Hangfire + MySQL + WebApi + EF Core + Swagger + Hangfire + HtmlAgilityPack + PuppeteerSharp + log4net + MailKit + axios + JavaScript + Json + ...

## 预览

### Blog：[https://meowv.com](https://meowv.com)

![white](static/white.jpg)
![black](static/black.jpg)

### API：[https://api.meowv.com](https://api.meowv.com)

![api](static/api.jpg)

### Hangfire：[https://api.meowv.com/hangfire](https://api.meowv.com/hangfire)

![hangfire](static/hangfire.jpg)

## LICENSE

This project is licensed under [MIT](LICENSE).
