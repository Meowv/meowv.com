---
title: SqlServer 游标循环处理数据
author: 阿星𝑷𝒍𝒖𝒔
date: 2018-06-20 08:45:45
categories: Database
tags:
  - SqlServer
---

在开发中，经常会遇到一个场景。需要批量处理数据，循环添加、删除、修改一些数据。

**需求：**

有 文章表（dbo.Gas_Article）、文章作者表（dbo.Gas_ArticleAuthor）

现在需要在后台统计出每个作者共发布了多少文章，和所有文章阅读量之和的数据

**以下是我的处理方案：**

编写 PROCEDURE，内部利用游标循环处理数据，然后使用 SqlServer 代理，新建一个作业定时任务处理，这样就可以在后台实时统计了。

```sql
CREATE PROCEDURE Job_UpdateAuthor --创建PROCEDURE
AS
    BEGIN
        DECLARE UpdateAuthorCursor CURSOR --定义游标
        FOR
            SELECT  COUNT(*) AS ArticleNumber ,
                    SUM(ShowHits) AS ArticleHits ,
                    Author
            FROM    dbo.Gas_Article
            WHERE   Author IN ( SELECT  Name
                                FROM    dbo.Gas_ArticleAuthor
                                WHERE   IsDelete = 0 )
            GROUP BY Author --查出需要的数据至游标中

        OPEN UpdateAuthorCursor --打开游标

        DECLARE @Number INT, @Hits INT, @Author NVARCHAR(255)
        FETCH NEXT FROM UpdateAuthorCursor INTO @Number, @Hits, @Author --读取第一行数据，赋值给变量

        WHILE @@FETCH_STATUS = 0
            BEGIN
                UPDATE  dbo.Gas_ArticleAuthor
                SET     ArticleNumber = @Number ,
                        ArticleHits = @Hits
                WHERE   Name = @Author -- 更新dbo.Gas_ArticleAuthor数据

                FETCH NEXT FROM UpdateAuthorCursor INTO @Number, @Hits, @Author --读取下一行数据
            END

        CLOSE UpdateAuthorCursor --关闭游标

        DEALLOCATE UpdateAuthorCursor --释放游标
    END
GO
```
