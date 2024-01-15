---
title: Python操作MongoDB数据库
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-12 20:40:00
categories: Python
tags:
  - MongoDB
  - 数据存储
---

## MongoDB 原生语句

[MongoDB 常用命令](/database/mongodb-shell)

## 安装 pymongo

`pip install pymongo`

## Python 连接 MongoDB

```python
import pymongo

# mobgodb连接对象
client = pymongo.MongoClient('localhost', port=27017)

# 获取数据库, 可以不用创建数据库
db = client.zhihu

# 获取数据库中的集合
collection = db.qa

# insert_one 写入数据
collection.insert_one({
    "username":"aaa",
    "password":'123456'
})

# insert_many 写入多条数据
collection.insert_many([
    {
        "username":"aaa",
        "age":18
    },
    {
        "username":"bbb",
        "age":20
    }
])

# find 查找所有数据
cursor = collection.find()
for x in cursor:
    print(x)

# find_one 获取一条数据
result = collection.find_one()
print(result)
# 添加查询条件
result = collection.find_one({"age":18})
print(result)

# 更新数据
collection.update_one({"username":"bbb"},{"$set":{"username":"spider"}})

# 更新多条数据
collection.update_many({"username":"aaa"},{"$set":{"username":"spider"}})

# 删除一条数据
collection.delete_one({"age":18})

# 删除多条数据
collection.delete_many({"username":'spider'})
```
