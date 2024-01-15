---
title: SQLite 查询语句
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-08-20 21:29:20
categories: Database
tags:
  - SQLite
---

## 随机一条数据

```sql
SELECT * FROM "main"."table" ORDER BY RANDOM() LIMIT 1
```

## 分页

```sql
SELECT *,rowid FROM "main"."table" LIMIT 0,10
```

## 所有表

```sql
select * from sqlite_master
```
