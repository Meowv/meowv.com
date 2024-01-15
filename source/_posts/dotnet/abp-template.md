---
title: 基于 abp vNext 的快速开发模板
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-09-02 08:51:02
categories: .NET
tags:
  - .NET Core
  - abp vNext
---

## 介绍

Templates to use when creating an application for abp vNext.

基于 abp 已经最小化集成了各种项目开发所需的组件，Redis、Swagger、Autofac、Serilog、数据迁移、JWT、多语言支持等，支持多数据库(MySql、SqlServer、Sqlite、MongoDB)自由切换，可以根据业务需求自行简单修改，真正的开箱即用，直接开干写业务。

## 快速使用

```bash
dotnet new -i AbpTemplate
dotnet new abp -n Xxx(The name for the output being created)
```

创建成功后的项目结构如下：

```bash
Documents
 ├── Documents.sln
 ├── LICENSE
 ├── src
 │   ├── Documents.Application
 │   ├── Documents.Application.Caching
 │   ├── Documents.Application.Contracts
 │   ├── Documents.DbMigrator
 │   ├── Documents.Domain
 │   ├── Documents.Domain.Shared
 │   ├── Documents.EntityFrameworkCore
 │   ├── Documents.EntityFrameworkCore.DbMigrations
 │   ├── Documents.HttpApi
 │   ├── Documents.HttpApi.Host
 │   └── Documents.MongoDB
 └── test
     ├── Documents.Application.Tests
     ├── Documents.Domain.Tests
     ├── Documents.EntityFrameworkCore.Tests
     ├── Documents.MongoDB.Tests
     └── Documents.TestBase
```

## Nuget

<https://www.nuget.org/packages/AbpTemplate>

## 开源地址

<https://github.com/Meowv/AbpTemplate>
