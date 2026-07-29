---
title: MongoDB 常用命令
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-08-24 16:14:14
categories: Database
tags:
  - MongoDB
---

## 常用基本操作

```sql
# 查看数据库列表
show dbs

# 查看当前数据库
db

# 新建一个表
db.createCollection('要新建的表名')

# 查看当前数据库下的表
show collections

# 删除当前数据库指定表
db.表名.drop()

# 删除当前数据库
db.dropDatabase()

# 查看当前库的所有用户
show users

# 删除当前使用数据库
db.dropDatabase()

# 将指定机器上的数据库的数据克隆到当前数据库
db.cloneDatabase(“127.0.0.1”)

# 将本机的db的数据复制到temp数据库中
db.copyDatabase("db", "temp", "127.0.0.1")
# 修复当前数据库
db.repairDatabase()

# 查看当前使用的数据库
db.getName()

# 显示当前db状态
db.stats()

# 当前db版本
db.version()

# 查看当前db的链接机器地址
db.getMongo()

# 查看当前的连接数
db.serverStatus().connections.current

# 更新列名
db.collection.update({}, {$rename : {"StoreId" : "MetaId"}}, false, true)

# 查询长度
db.getCollection("table").find({$where:'this.StoreId.length>2'},{Name:0})

# 查询总条数
db.getCollection("table").find({}).count()

# 区间查询
db.getCollection("collection").find({'StoreId':1139,'CardNo':{'$gte':'90225001','$lte':'90295000'}})

# 多个区间查询
db.getCollection("collection").find({ $or : [{ $and : [{"CardNo" : { $gte : "10000001" }}, {"CardNo" : { $lte : "10000003" }}] }, { $and : [{"CardNo" : { $gte : "10000006" }}, {"CardNo" : { $lte : "10000008" }}] }] }).limit(1000).skip(0)

# 排序 1升序 -1降序
db.getCollection("collection").find().sort({"CreationTime":1})

# 更改字段类型
db.collection.find({'PicId' : { $type : 16 }}).forEach(function(x) {x.PicId = String(x.PicId);db.table_Experts.save(x);})

# 添加一个字段
db.collection.update({}, {$set: {content:""}}, {multi: true})

# 删除一个字段
db.collection.update({},{$unset:{content:""}},false, true)

# 清空数据
db.collection.remove({})

# 查询指定列
db.news.find( {}, { id: 1, title: 1 } )

# 修改列表
db.getCollection('collection').update({},{$rename:{"OId":'MetaId'}},false,true)

# update
db.getCollection('collection').update(
    // query
    {
        "MenuKey" : 28
    },
    // update
    {
        $set:{"Url":"..."}
    },
    false,
    true
);

# 按照时间年月分组
db.collection.aggregate([
 {$match: { CreateDate: { $gte: new Date('2018-01-01'), $lte: new Date('2019-07-31') }  }} ,
 {$group:{_id:{CreateDate:{year: { $year: "$CreateDate"},month: { $month: "$CreateDate" }}}, count: { $sum: 1 }}}
])

# 分组
db.collection.aggregate([
    {
        $match: {
            CreateDate: {
                $gte: new Date('2017-01-01'),
                $lte: new Date('2019-07-31')
            }
        }
    },
    {
        "$group": {
            _id: {
                month: {
                    $dateToString: {
                        format: "%Y-%m",
                        date: "$CreateDate"
                    }
                }
            },
            count: {
                $sum: 1
            }
        }
    },
    {
        "$project": {
            "年月": "$_id.month",
            "总数": "$count",
        }
    }
])


# all匹配list
db.getCollection("collection").find({
    CategoryList: {
        $all: [
            {
                "$elemMatch": {
                    "CategoryId": 'gz',
                }
            },
            {
                "$elemMatch": {
                    "CategoryId": 'g1',
                }
            },
            {
                "$elemMatch": {
                    "CategoryId": 'g1wy',
                }
            }
        ]
    }
});

# 集合查询
db.getCollection("collection").find({
    "CardList": {
        $elemMatch: {
            $and: [{
                "CardType": 14
            }, {
                "Number": {
                    $gt: 0
                }
            }]
        }
    }
})

# 集合查询同时满足多个条件
db.getCollection("collection").find({
    CardList: {
        $all: [
            {
                "$elemMatch": {
                    "CardType": 2,
                    "Name": "aaa"
                }
            },
            {
                "$elemMatch": {
                    "CardType": 3,
                    "Name": "bbb"
                }
            }
        ]
    }
});

# and查询
db.getCollection("collection").find({
    $and: [
        {
            CardList: {
                "$elemMatch": {
                    "CardType": 2,
                    "Name": "aaa"
                }
            }
        },
        {
            CardList: {
                "$elemMatch": {
                   "CardType": 3,
                    "Name": "bbb"
                }
            }
        }
    ]
});

# 集合长度查询
db.getCollection("collection").find({
    StudentNumId: 1168,
    _id: ObjectId('5be29c013a9d283484b7173f'),
    'FiveStars': {
        $size: 3 //集合长度等于3
    }
});

# 多字段同时分组
db.getCollection('collection').aggregate([{
    "$match": {
        "$and": [{
            "ParentName": {
                "$eq": ""
            }
        }]
    }
}, {
    "$group": {
        "_id": {
            "GroupName": {
                $concat: [{
                    $substr: ["$Year", 0, 4]
                }, "-", {
                    $substr: ["$Month", 0, 2]
                }]
            }
        }
    }
}, {
    "$project": {
        "GroupName": "$_id.GroupName",
        "_id": 0
    }
}])

# 多表联合查询
db.getCollection("collection").aggregate(
    [
        {
            $match: {
                $and: [
                    {
                        $and: [{
                            "IsDeleted": {
                                $ne: true
                            }
                        }, {
                            "ProvinceId": 859
                        }]
                    },
                    {
                        $or: [{
                            $and: [{
                                "CourseTypeId": 1
                            }, {
                                "Total": {
                                    $gte: 400
                                }
                            }, {
                                "Total": {
                                    $lte: 517
                                }
                            }]
                        }, {
                            $and: [{
                                "CourseTypeId": 0
                            }, {
                                "Total": {
                                    $gte: 363
                                }
                            }, {
                                "Total": {
                                    $lte: 467
                                }
                            }]
                        }]
                    }
                ]
            }
        },
        {
            $lookup: {
                from: "collection2",
                localField: "UserId",
                foreignField: "NumId",
                as: "users"
            }
        },
        {
            $project: {
                "用户名": {
                    $arrayElemAt: ['$users.Username', 0]
                },
                "手机号": {
                    $arrayElemAt: ['$users.MobilePhone', 0]
                },
                "真实姓名": {
                    $arrayElemAt: ['$users.RealName', 0]
                },
                "Total": 1
            }
        },
    ]
);

# 时间格式化后分组查询
db.collection.aggregate(
    [
        {
            "$match": {
                "$and": [{
                    "Status": 2
                }, {
                    "Type": 2
                }
        ]
            }
        },
        {
            "$group": {
                _id: {
                    month: {
                        $dateToString: {
                            format: "%Y-%m",
                            date: "$Time"
                        }
                    }
                },
                sum: {
                    $sum: "$Price"
                }
            }
        },
        {
            "$project": {
                "Date": "$_id.month",
                "Sum": "$sum",
                "_id": 0
            }
        }
    ]
)
```

## Collection 聚集集合

```shell
# 创建一个聚集集合
db.createCollection("collectionName", {size: 20, capped: 5, max: 100});

# 得到指定名称的聚集集合
db.getCollection("account");

# 得到当前db的所有聚集集合
db.getCollectionNames();

# 显示当前db所有聚集索引的状态
db.printCollectionStats();

# 查看聚集集合基本信息

# 查看帮助
db.yourColl.help();

# 查询当前集合的数据条数
db.yourColl.count();

# 查看数据空间大小
db.userInfo.dataSize();

# 得到当前聚集集合所在的db
db.userInfo.getDB();

# 得到当前聚集的状态
db.userInfo.stats();

# 得到聚集集合总大小
db.userInfo.totalSize();

# 聚集集合储存空间大小
db.userInfo.storageSize();

# Shard版本信息
db.userInfo.getShardVersion();

# 聚集集合重命名
# 将userInfo重命名为users
db.userInfo.renameCollection("users");

# 删除当前聚集集合
db.userInfo.drop();
```

## 数据的增删改查操作

```shell
# 增：
# 插入一条数据
db.表名.insert(数据);
db.test1.insertOne(数据); #insertOne只能插入1条数据

# 插入多条数据
db.表名.insert([数据1,数据2]);
db.表名.insertMany([数据1,数据2]);

# save
db.表名.save(数据);

# insert与save区别：
# 当默认的“_id”值已存在时，调用insert方法插入会报错；而save方法不会,会更新相同的_id所在行数据的信息

# 删
db.表名.remove(条件); #默认只删除第1条符合条件的数据
db.表名.deleteOne(条件)

# 删除所有符合条件的数据
db.表名.deleteMany(条件)

# 改
db.表名.update({"条件字段名":"字段值"},{$set:{"要修改的字段名":"修改后的字段值"}});

# 修改一条数据updateOne
db.inventory.updateOne(
   { item: "paper" },
   {
     $set: { "size.uom": "cm", status: "P" },
     $currentDate: { lastModified: true }
   }
)

# 修改多条数据updateMany
db.inventory.updateMany(
   { "qty": { $lt: 50 } },
   {
     $set: { "size.uom": "in", status: "P" },
     $currentDate: { lastModified: true }
   }
)

# 替换replaceOne
db.inventory.replaceOne(
   { item: "paper" },
   { item: "paper", instock: [ { warehouse: "A", qty: 60 }, { warehouse: "B", qty: 40 } ] }
)

# 查
db.表名.find()# 查询表中所有数据

db.表名.find(条件)# 按条件查询

db.表名.findOne(条件)# 查询第一条(支持条件)

db.表名.find().limit(数量)# 限制数量(分页)

db.表名.find().skip(数量)# 跳过指定数量

db.表名.find().skip(起始数量).limit(显示的数量) # 如：显示从10开始的10条数据
```

## db.serverStatus()详解

```sql
PRIMARY > db.serverStatus()
 {
    "host": "cd9a511a2d0e",
    #主机名
    "version": "2.6.1",
    ,
    #版本号
    "process": "mongod",
    #进程名
    "pid": NumberLong(41),
    #进程ID
    "uptime": 3785943,
    #运行时间
    "uptimeMillis": NumberLong("3785942955"),
    "uptimeEstimate": 3755878,
    "localTime": ISODate("2015-10-16T02:46:27.368Z"),
    #当前时间
    "asserts": {
        #各个断言的数量
        "regular": 0,
        "warning": 0,
        "msg": 0,
        "user": 58,
        "rollovers": 0
    },
    "backgroundFlushing": {
        "flushes": 63098,
        #刷新次数
        "total_ms": 144997713,
        #刷新花费总时间
        "average_ms": 2297.97637009097,
        #平均时间
        "last_ms": 10913,
        #最后一次时间
        "last_finished": ISODate("2015-10-16T02:45:40.363Z") #最后刷新时间
    },
    "connections": {
        "current": 1444,
        #当前连接数
        "available": 18556,
        #可用连接数
        "totalCreated": NumberLong(2429949)
    },
    "cursors": {
        "note": "deprecated, use server status metrics",
        "clientCursors_size": 1,
        #客户端游标大小
        "totalOpen": 1,
        #打开游标数
        "pinned": 0,
        "totalNoTimeout": 481,
        "timedOut": 84 #超时时间
    },
    "dur": {
        "commits": 27,
        "journaledMB": 2.711552,
        "writeToDataFilesMB": 5.213888,
        "compression": 0.5158220112430492,
        "commitsInWriteLock": 0,
        "earlyCommits": 0,
        "timeMs": {
            "dt": 3003,
            "prepLogBuffer": 1,
            "writeToJournal": 228,
            "writeToDataFiles": 10,
            "remapPrivateView": 2
        }
    },
    "extra_info": {
        "note": "fields vary by platform",
        "heap_usage_bytes": 96529464,
        #堆使用情况（字节）
        "page_faults": 11253067 #页面故障数
    },
    "globalLock": {
        "totalTime": NumberLong("3785942955000"),
        "lockTime": NumberLong("47441423960"),
        "currentQueue": {
            "total": 0,
            "readers": 0,
            "writers": 0
        },
        "activeClients": {
            "total": 0,
            "readers": 0,
            "writers": 0
        }
    },
    "indexCounters": {
        "accesses": 5980339643,
        #索引被访问数
        "hits": 5980339322,
        #索引命中数
        "misses": 0,
        #索引偏差数
        "resets": 0,
        #复位数
        "mi***atio": 0 #未命中率
    },
    "locks": {
        ".": {
            "timeLockedMicros": {
                "R": NumberLong(1300731481),
                "W": NumberLong("47441423960")
            },
            "timeAcquiringMicros": {
                "R": NumberLong("83350794378"),
                "W": NumberLong("8842280365")
            }
        },
    },
    "network": {
        "bytesIn": 182494603618,
        #输入数据（byte）
        "bytesOut": NumberLong("2936449550300"),
        #输出数据（byte）
        "numRequests": 600302443 #请求数
    },
    "opcounters": {
        "insert": 214538892,
        #插入操作数
        "query": 388689,
        #查询操作数
        "update": 3462611,
        #更新操作数
        "delete": 0,
        ,
        #删除操作数
        "getmore": 188590632,
        #获取更多的操作数
        "command": 197825527 #其他命令操作数
    },
    "opcountersRepl": {
        "insert": 1,
        "query": 0,
        "update": 0,
        "delete": 0,
        "getmore": 0,
        "command": 0
    },
    "recordStats": {
        "accessesNotInMemory": 8377141,
        "pageFaultExceptionsThrown": 2926497,
        "admin": {
            "accessesNotInMemory": 94,
            "pageFaultExceptionsThrown": 0
        }
    },
    "repl": {
        #复制情况
        "setName": "c562ca6c-1d72-4c6a-a943-b46fe87e47ca",
        "setVersion": 105039,
        "ismaster": true,
        "secondary": false,
        "hosts": [
            "10.10.1.1:27017",
            "10.10.1.2:27017"
        ],
        "arbiters": [
            "10.10.1.2:27017"
        ],
        "primary": "10.10.1.4:27017",
        "me": "10.10.1.5:27017"
    },
    "writeBacksQueued": false,
    "mem": {
        #内存情况
        "bits": 64,
        #64位操作系统
        "resident": 4430,
        #占有物理内存数
        "virtual": 813370,
        #占有虚拟内存数
        "supported": true,
        #是否支持内存扩展
        "mapped": 405498,
        "mappedWithJournal": 810996
    },
    "metrics": {
        "cursor": {
            "timedOut": NumberLong(84),
            "open": {
                "noTimeout": NumberLong(481),
                "pinned": NumberLong(0),
                "total": NumberLong(1)
            }
        },
        "document": {
            "deleted": NumberLong(0),
            "inserted": NumberLong(214538892),
            "returned": NumberLong("6735629965"),
            "updated": NumberLong(6502807)
        },
        "getLastError": {
            "wtime": {
                "num": 0,
                "totalMillis": 0
            },
            "wtimeouts": NumberLong(0)
        },
        "operation": {
            "fastmod": NumberLong(3483995),
            "idhack": NumberLong(39),
            "scanAndOrder": NumberLong(6)
        },
        "queryExecutor": {
            "scanned": NumberLong(107218344),
            "scannedObjects": NumberLong(107217952)
        },
        "record": {
            "moves": NumberLong(1604)
        },
        "repl": {
            "apply": {
                "batches": {
                    "num": 2,
                    "totalMillis": 8
                },
                "ops": NumberLong(1)
            },
            "buffer": {
                "count": NumberLong(0),
                "maxSizeBytes": 268435456,
                "sizeBytes": NumberLong(0)
            },
            "network": {
                "bytes": NumberLong(709),
                "getmores": {
                    "num": 18,
                    "totalMillis": 86108
                },
                "ops": NumberLong(2),
                "readersCreated": NumberLong(35)
            },
            "preload": {
                "docs": {
                    "num": 0,
                    "totalMillis": 0
                },
                "indexes": {
                    "num": 1,
                    "totalMillis": 0
                }
            }
        },
        "storage": {
            "freelist": {
                "search": {
                    "bucketExhausted": NumberLong(0),
                    "requests": NumberLong(6551285),
                    "scanned": NumberLong(12001208)
                }
            }
        },
        "ttl": {
            "deletedDocuments": NumberLong(0),
            "passes": NumberLong(63048)
        }
    },
    "ok": 1
}
```

## 权限管理

### mongodb 数据库用户角色

```shell
# 数据库用户角色
read：允许用户读取指定数据库
readWrite：允许用户读写指定数据库

# 数据库管理员角色
dbAdmin：允许用户进行索引创建、删除，查看统计或访问system.profile，但没有角色和用户管理的权限
userAdmin：提供了在当前数据库中创建和修改角色和用户的能力
dbOwner： 提供对数据库执行任何管理操作的能力。这个角色组合了readWrite、dbAdmin和userAdmin角色授予的特权。

# 集群管理角色
clusterAdmin ： 提供最强大的集群管理访问。组合clusterManager、clusterMonitor和hostManager角色的能力。还提供了dropDatabase操作
clusterManager ： 在集群上提供管理和监视操作。可以访问配置和本地数据库，这些数据库分别用于分片和复制
clusterMonitor ： 提供对监控工具的只读访问，例如MongoDB云管理器和Ops管理器监控代理。
hostManager ： 提供监视和管理服务器的能力。

# 备份恢复角色
backup ： 提供备份数据所需的能力，使用MongoDB云管理器备份代理、Ops管理器备份代理或使用mongodump
restore ： 提供使用mongorestore恢复数据所需的能力

# 所有数据库角色
readAnyDatabase：只在admin数据库中可用，赋予用户所有数据库的读权限
readWriteAnyDatabase：只在admin数据库中可用，赋予用户所有数据库的读写权限
userAdminAnyDatabase：只在admin数据库中可用，赋予用户所有数据库的userAdmin权限
dbAdminAnyDatabase：只在admin数据库中可用，赋予用户所有数据库的dbAdmin权限。

# 超级用户角色
root：提供对readWriteAnyDatabase、dbAdminAnyDatabase、userAdminAnyDatabase、clusterAdmin、restore和backup的所有资源的访问
```

### 创建用户

```shell
#创建超级管理员
use admin
db.createUser({
    user:"admin",
    pwd:"123456",
    roles:[{
        role:"root",
        db:"admin"
    }]
})

#创建普通用户
#创建test用户，密码为123456，权限为testDB数据库的readWrite权限
use testDB #进入testDB数据库
db.createUser({user:'test',pwd:'123456',roles:[{role:'readWrite',db:'testDB'}]})

#修改密码
db.updateUser('test',{user:'test',pwd:'admin',roles:[{role:'read',db:'testDB'}]})  //修改密码 并且 //修改角色为只读
```

### 常用的用户命令

```shell
#添加一个用户
db.addUser("name");
db.addUser("userName", "pwd123", true); 添加用户、设置密码、是否只读

#数据库认证、安全模式
db.auth("userName", "123123");

#查看所有用户
 show users;
#删除用户
 db.removeUser("test")
```

## 索引

```shell
# 创建索引
db.userInfo.ensureIndex({name: 1});
db.userInfo.ensureIndex({name: 1, ts: -1});

# 查询当前聚集集合所有索引
db.userInfo.getIndexes();

# 查看总索引记录大小
db.userInfo.totalIndexSize();

# 读取当前集合的所有index信息
db.users.reIndex();

# 删除指定索引
db.users.dropIndex("index_name");

# 删除所有索引索引
db.users.dropIndexes();
```
