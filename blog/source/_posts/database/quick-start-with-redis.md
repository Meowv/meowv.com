---
title: Redis快速入门及使用
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-24 22:18:24
categories: Database
tags:
  - Redis
---

## 概述

redis 是一种支持分布式的 nosql 数据库,他的数据是保存在内存中，同时 redis 可以定时把内存数据同步到磁盘，即可以将数据持久化，并且他比 memcached 支持更多的数据结构\(string,list 列表\[队列和栈\],set\[集合\],sorted set\[有序集合\],hash\(hash 表\)\)。

redis 文档：[http://redisdoc.com/index.html](http://redisdoc.com/index.html)

## Redis 使用场景

- 登录会话存储：存储在 redis 中，与 memcached 相比，数据不会丢失。
- 排行版/计数器：比如一些秀场类的项目，经常会有一些前多少名的主播排名。还有一些文章阅读量的技术，或者新浪微博的点赞数等。
- 作为消息队列：比如 celery 就是使用 redis 作为中间人。
- 当前在线人数：当前系统有多少在线人数。
- 一些常用的数据缓存：比如我们的 BBS 论坛，板块不会经常变化的，但是每次访问首页都要从 mysql 中获取，可以在 redis 中缓存起来，不用每次请求数据库。
- 把前 200 篇文章缓存或者评论缓存：一般用户浏览网站，只会浏览前面一部分文章或者评论，那么可以把前面 200 篇文章和对应的评论缓存起来。用户访问超过的，就访问数据库，并且以后文章超过 200 篇，则把之前的文章删除。
- 好友关系：微博的好友关系使用 redis 实现。
- 发布和订阅功能：可以用来做聊天软件。

## Redis 和 Memcached 的比较

|              | Memcached                       | Redis                          |
| :----------- | :------------------------------ | :----------------------------- |
| 类型         | 纯内存数据库                    | 内存磁盘同步数据库             |
| 数据类型     | 在定义 value 时就要固定数据类型 | 不需要                         |
| 虚拟内存     | 不支持                          | 支持                           |
| 过期策略     | 支持                            | 支持                           |
| 存储数据安全 | 不支持                          | 可以将数据同步到 dump.db 中    |
| 灾难恢复     | 不支持                          | 可以将磁盘中的数据恢复到内存中 |
| 分布式       | 支持                            | 主从同步                       |
| 订阅与发布   | 不支持                          | 支持                           |

## Redis 在 windows 系统中的安装与启动

- 下载：redis 官方是不支持 windows 操作系统的，但是微软的开源部门将 redis 移植到了 windows 上，因此下载地址不是在 redis 官网上，而是在 github 上：[https://github.com/MicrosoftArchive/redis/releases](https://github.com/MicrosoftArchive/redis/releases)
- 安装：点击一顿下一步安装就可以了
- 运行：进入到 redis 安装所在的路径然后执行`redis-server.exe redis.windows.conf`就可以运行了
- 连接：redis 和 mysql 以及 mongo 是一样的，都提供了一个客户端进行连接。输入命令 redis-cli（前提是 redis 安装路径已经加入到环境变量中了）就可以连接到 redis 服务器了

## Redis 在 ubuntu 系统中的安装与启动

- 安装：`sudo apt-get install redis-server`
- 卸载：`sudo apt-get purge --auto-remove redis-server`
- 启动：redis 安装后，默认会自动启动，可以通过以下命令查看：`ps aux|grep redis`
- 如果想自己手动启动，可以通过以下命令进行启动：`sudo service redis-server start`
- 停止：`sudo service redis-server stop`

## Redis 服务器允许其它机器访问

- 想要让其他机器访问本机的 redis 服务器。那么要修改 redis.conf 的配置文件，将 bind 改成 bind \[自己的 ip 地址或者 0.0.0.0\]，其他机器才能访问。
- bind 绑定的是本机网卡的 ip 地址，而不是想让其他机器连接的 ip 地址。如果有多块网卡，那么可以绑定多个网卡的 ip 地址。如果绑定到额是 0.0.0.0，那么意味着其他机器可以通过本机所有的 ip 地址进行访问。

## 对 Redis 的操作

操作 redis 可以分为两种方式，第一种是使用 redis-cli，第二种就是使用编程语言对其操作， 如：.NET、Python 等

### 启动 redis

`sudo service redis-server start`

### 连接 redis-server

`redis-cli -h [ip] -p [端口]`

### 添加

`set key value` 如：`set key articles`

将字符串值 value 关联到 key。如果 key 已经持有其他值，set 命令就覆写旧值，无视其类型。并且默认的过期时间是永久，即永远不会过期。

### 删除

`del key` 如：`del articles`

### 设置过期时间

`expire key timeout(单位为秒)`

也可以在设置值的时候，一同指定过期时间

`set key value EX timeout` 或：`setex key timeout value`

### 查看过期时间

`ttl key` 如：`ttl articles`

### 查看当前 redis 中的所有 key

`keys *`

### 列表操作

- 在列表左边添加元素

  `lpush key value`

  将值 value 插入到列表 key 的表头。如果 key 不存在，一个空列表会被创建并执行 lpush 操作。当 key 存在但不是列表类型时，将返回一个错误

- 在列表右边添加元素

  `rpush key value`

  将值 value 插入到列表 key 的表尾。如果 key 不存在，一个空列表会被创建并执行 RPUSH 操作。当 key 存在但不是列表类型时，返回一个错误

- 查看列表中的元素

  `lrange key start stop`

  返回列表 key 中指定区间内的元素，区间以偏移量 start 和 stop 指定,如果要查看左边的第一个到最后的一个则：`lrange key 0 -1`

- 移除列表中的元素
  - 移除并返回列表 key 的头元素：`lpop key`
  - 移除并返回列表的尾元素：`rpop key`
  - 移除并返回列表 key 的中间元素：`lrem key count value` 将删除 key 这个列表中，count 个值为 value 的元素
- 指定返回第几个元素

  `lindex key index` 将返回 key 这个列表中，索引为 index 的这个元素

- 获取列表中的元素个数

  `llen key` 如：`llen languages`

  根据参数 count 的值，移除列表中与参数 value 相等的元素。count 的值可以是以下几种

  - count &gt; 0：从表头开始向表尾搜索，移除与 value 相等的元素，数量为 count
  - count &lt; 0：从表尾开始向表头搜索，移除与 value 相等的元素，数量为 count 的绝对值
  - count = 0：移除表中所有与 value 相等的值

### set 集合的操作

- 添加元素

  `sadd set value1 value2....` 如：`sadd team web app`

- 查看元素

  `smembers set` 如：`smembers team`

- 移除元素

  `rem set member...` 如：`srem team web app`

- 查看集合中的元素个数

  `scard set` 如：`scard team1`

- 获取多个集合的交集

  `sinter set1 set2` 如：`sinter team1 team2`

- 获取多个集合的并集

  `sunion set1 set2` 如：`sunion team1 team2`

- 获取多个集合的差集

  `sdiff set1 set2` 如：`sdiff team1 team2`

### hash 哈希操作

- 添加一个新值

  `hset key field value` 如：`hset website baidu baidu.com`

  将哈希表 key 中的域 field 的值设为 value，如果 key 不存在，一个新的哈希表被创建并进行 HSET 操作。如果域 field 已经存在于哈希表中，旧值将被覆盖。

- 获取哈希中的 field 对应的值

  `hget key field` 如：`hget website baidu`

- 删除 field 中的某个 field

  `hdel key field` 如：`hdel website baidu`

- 获取某个哈希中所有的 field 和 value

  `hgetall key` 如：`hgetall website`

- 获取某个哈希中所有的 field

  `hkeys key` 如：`hkeys website`

- 获取某个哈希中所有的值

  `hvals key` 如：`hvals website`

- 判断哈希中是否存在某个 field

  `hexists key field` 如：`hexists website baidu`

- 获取哈希中总共的键值对

`hlen field` 如：`hlen website`

### 事务操作

Redis 事务可以一次执行多个命令，事务具有以下特征

- 隔离操作：事务中的所有命令都会序列化、按顺序地执行，不会被其他命令打扰
- 原子操作：事务中的命令要么全部被执行，要么全部都不执行
- 开启一个事务：`multi`，以后执行的所有命令，都在这个事务中执行的
- 执行事务：`exec`，会将在`multi`和`exec`中的操作一并提交
- 取消事务：`discard`，会将`multi`后的所有命令取消
- 监视一个或者多个 key：`watch key...`，监视一个\(或多个\)key，如果在事务执行之前这个\(或这些\) key 被其他命令所改动，那么事务将被打断
- 取消所有 key 的监视：`unwatch`

### 发布/订阅操作

- 给某个频道发布消息：`publish channel message`
- 订阅某个频道的消息：`subscribe channel`
