---
title: CentOS 安装 kafka
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-08-22 23:22:42
categories: Other
tags:
  - CentOS
  - kafka
---

- Kafka : <http://kafka.apache.org/downloads>
- ZooLeeper : <https://zookeeper.apache.org/releases.html>

## 下载并解压

```bash
# 下载，并解压
$ wget https://archive.apache.org/dist/kafka/2.1.1/kafka_2.12-2.1.1.tgz
$ tar -zxvf  kafka_2.12-2.1.1.tgz
$ mv kafka_2.12-2.1.1.tgz /data/kafka

# 下载 zookeeper，解压
$ wget https://mirror.bit.edu.cn/apache/zookeeper/zookeeper-3.5.8/apache-zookeeper-3.5.8-bin.tar.gz
$ tar -zxvf apache-zookeeper-3.5.8-bin.tar.gz
$ mv apache-zookeeper-3.5.8-bin /data/zookeeper
```

## 启动 ZooKeeper

```bash
# 复制配置模版
$ cd /data/kafka/conf
$ cp zoo_sample.cfg zoo.cfg

# 看看配置需不需要改
$ vim zoo.cfg

# 命令
$ ./bin/zkServer.sh start    # 启动
$ ./bin/zkServer.sh status   # 状态
$ ./bin/zkServer.sh stop     # 停止
$ ./bin/zkServer.sh restart  # 重启

# 使用客户端测试
$ ./bin/zkCli.sh -server localhost:2181
$ quit
```

## 启动 Kafka

```bash
# 备份配置
$ cd /data/kafka
$ cp config/server.properties config/server.properties_copy

# 修改配置
$ vim /data/kafka/config/server.properties

# 集群配置下，每个 broker 的 id 是必须不同的
# broker.id=0

# 监听地址设置（内网）
# listeners=PLAINTEXT://ip:9092

# 对外提供服务的IP、端口
# advertised.listeners=PLAINTEXT://106.75.84.97:9092

# 修改每个topic的默认分区参数num.partitions，默认是1，具体合适的取值需要根据服务器配置进程确定，UCloud.ukafka = 3
# num.partitions=3

# zookeeper 配置
# zookeeper.connect=localhost:2181

# 通过配置启动 kafka
$  ./bin/kafka-server-start.sh  config/server.properties&

# 状态查看
$ ps -ef|grep kafka
$ jps
```
