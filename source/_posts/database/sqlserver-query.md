---
title: SqlServer 常用查询语句
author: 阿星𝑷𝒍𝒖𝒔
date: 2018-01-25 20:55:17
categories: Database
tags:
  - SqlServer
---

```sql
SELECT request_session_id AS spid, OBJECT_NAME(resource_associated_entity_id) AS tableName
FROM sys.dm_tran_locks
WHERE resource_type = 'OBJECT'
    AND OBJECT_NAME(resource_associated_entity_id) IS NOT NULL;
```

```sql
SELECT 'kill ' + CAST(request_session_id AS VARCHAR(20)) AS spid
FROM sys.dm_tran_locks
WHERE resource_type = 'OBJECT'
    AND OBJECT_NAME(resource_associated_entity_id) IS NOT NULL;
```

```sql
select * from table order by Id offset 0 rows fetch next 10 rows only;
```

```sql
SELECT COUNT(1) FROM TableName WHERE 1 = 1;

SELECT *
FROM (
    SELECT ROW_NUMBER() OVER (ORDER BY Id DESC) AS RowId, *
    FROM TableName
    WHERE 1 = 1
) t
WHERE t.RowId BETWEEN @page AND @limit;
```
