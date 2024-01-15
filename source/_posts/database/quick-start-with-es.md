---
title: Elasticsearch 快速入门
author: 阿星𝑷𝒍𝒖𝒔
date: 2020-09-09 11:07:58
categories: Database
tags:
  - Elasticsearch
---

[ElasticSearch](https://www.elastic.co/cn/) 是一个开源的搜索引擎，建立在一个全文搜索引擎库 Apache Lucene™ 基础之上。 Lucene 可以说是当下最先进、高性能、全功能的搜索引擎库，​ 无论是开源还是私有。

但是 Lucene 仅仅只是一个库。为了充分发挥其功能，你需要使用 Java 并将 Lucene 直接集成到应用程序中。 更糟糕的是，您可能需要获得信息检索学位才能了解其工作原理。Lucene 非常 复杂。

[ElasticSearch](https://www.elastic.co/cn/) 也是使用 Java 编写的，它的内部使用 Lucene 做索引与搜索，但是它的目的是使全文检索变得简单， 通过隐藏 Lucene 的复杂性，取而代之的提供一套简单一致的 RESTful API。

然而，Elasticsearch 不仅仅是 Lucene，并且也不仅仅只是一个全文搜索引擎。 它可以被下面这样准确的形容：

- 一个分布式的实时文档存储，每个字段 可以被索引与搜索
- 一个分布式实时分析搜索引擎
- 能胜任上百个服务节点的扩展，并支持 PB 级别的结构化或者非结构化数据

官方客户端在 Java、.NET、PHP、Python、Ruby、Nodejs 和许多其他语言中都是可用的。根据 DB-Engines 的排名显示，ElasticSearch 是最受欢迎的企业搜索引擎，其次是 Apache Solr，也是基于 Lucene。

## ES 开发指南

中文文档请参考：[《Elasticsearch: 权威指南》](https://www.elastic.co/guide/cn/elasticsearch/guide/cn/index.html)

英文文档请参考：[《Elasticsearch Reference》](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)

下载： <https://www.elastic.co/cn/downloads/>

## ES API 文档

[API Conventions](https://www.elastic.co/guide/en/elasticsearch/reference/current/api-conventions.html)

[Document APIs](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs.html)

[Search APIs](https://www.elastic.co/guide/en/elasticsearch/reference/current/search.html)

[Indices APIs](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices.html)

[cat APIs](https://www.elastic.co/guide/en/elasticsearch/reference/current/cat.html)

[Cluster APIs](https://www.elastic.co/guide/en/elasticsearch/reference/current/cluster.html)

[Javascript api](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html)

## Logstash

[Logstash Reference](https://www.elastic.co/guide/en/logstash/current/index.html)

[Configuring Logstash](https://www.elastic.co/guide/en/logstash/current/configuration.html)

[Input plugins](https://www.elastic.co/guide/en/logstash/current/input-plugins.html)

[Output plugins](https://www.elastic.co/guide/en/logstash/current/output-plugins.html)

[Filter plugins](https://www.elastic.co/guide/en/logstash/current/filter-plugins.html)

## Kibana DevTools 快捷键

- Ctrl+i 自动缩进
- Ctrl+Enter 提交
- Down 打开自动补全菜单
- Enter 或 Tab 选中项自动补全
- Esc 关闭补全菜单

`pretty = true`在任意的查询字符串中增加 pretty 参数，会让 Elasticsearch 美化输出(pretty-print)JSON 响应以便更加容易阅读。

## Kibana 命令

```bash
// 查询集群的磁盘状态
GET _cat/allocation?v

// 获取所有索引
GET _cat/indices

// 按索引数量排序
GET _cat/indices?s=docs.count:desc
GET _cat/indices?v&s=index

// 集群有多少节点
GET _cat/nodes

// 集群的状态
GET _cluster/health?pretty=true
GET _cat/indices/*?v&s=index

//获取指定索引的分片信息
GET logs/_search_shards

...
```

## 集群状态

```json
curl -s -XGET 'http://<host>:9200/_cluster/health?pretty'

//系统正常，返回的结果
{
  "cluster_name" : "es-qwerty",
  "status" : "green",
  "timed_out" : false,
  "number_of_nodes" : 3,
  "number_of_data_nodes" : 3,
  "active_primary_shards" : 1,
  "active_shards" : 2,
  "relocating_shards" : 0,
  "initializing_shards" : 0,
  "unassigned_shards" : 0,
  "delayed_unassigned_shards" : 0,
  "number_of_pending_tasks" : 0,
  "number_of_in_flight_fetch" : 0,
  "task_max_waiting_in_queue_millis" : 0,
  "active_shards_percent_as_number" : 100.0
}
```

## 检索文档

```json
POST logs/_search
{
  "query":{
    "range":{
      "createdAt":{
        "gt":"2020-04-25",
        "lt":"2020-04-27",
        "format": "yyyy-MM-dd"
      }
    }
  },
  "size":0,
  "aggs":{
    "url_type_stats":{
      "terms": {
        "field": "urlType.keyword",
        "size": 2
      }
    }
  }
}

POST logs/_search
{
  "query":{
    "range":{
      "createdAt":{
        "gte":"2020-04-26 00:00:00",
        "lte":"now",
        "format": "yyyy-MM-dd hh:mm:ss"
      }
    }
  },
  "size":0,
  "aggs":{
    "url_type_stats":{
      "terms": {
        "field": "urlType.keyword",
        "size": 2
      }
    }
  }
}

POST logs/_search
{
  "query":{
    "range": {
      "createdAt": {
        "gte": "2020-04-26 00:00:00",
        "lte": "now",
         "format": "yyyy-MM-dd hh:mm:ss"
      }
    }
  },
  "size" : 0,
  "aggs":{
    "total_clientIp":{
      "cardinality":{
        "field": "clientIp.keyword"
      }
    },
    "total_userAgent":{
      "cardinality": {
        "field": "userAgent.keyword"
      }
    }
  }
}

POST logs/_search
{
  "size" : 0,
  "aggs":{
    "date_total_ClientIp":{
      "date_histogram":{
        "field": "createdAt",
        "interval": "quarter",
        "format": "yyyy-MM-dd",
        "extended_bounds":{
          "min": "2020-04-26 13:00:00",
          "max": "2020-04-26 14:00:00",
        }
      },
      "aggs":{
        "url_type_api": {
          "terms": {
            "field": "urlType.keyword",
            "size": 10
          }
        }
      }
    }
  }
}

POST logs/_search
{
  "size" : 0,
  "aggs":{
    "total_clientIp":{
      "terms":{
        "size":30,
        "field": "clientIp.keyword"
      }
    }
  }
}
```

## 删除文档

```bash
// 删除
POST logs/_delete_by_query {"query":{"match_all": {}}}

// 删除索引
DELETE logs
```

## 创建索引

数据迁移本质是索引的重建，重建索引不会尝试设置目标索引，它不会复制源索引的设置。 所以在操作之前设置目标索引，包括设置映射，分片数，副本等。

## 数据迁移

### Reindex from Remoteedit

```json
// Reindex支持从远程Elasticsearch集群重建索引：
POST _reindex
{
  "source": {
    "remote": {
      "host": "http://lotherhost:9200",
      "username": "user",
      "password": "pass"
    },
    "index": "source",
    "query": {
      "match": {
        "test": "data"
      }
    }
  },
  "dest": {
    "index": "dest"
  }
}

// host参数必须包含scheme、host和port（例如https://lotherhost:9200）
// username和password参数可选
```

使用时需要在 elasticsearch.yml 中配置 reindex.remote.whitelist 属性。可以设置多组（例如，lotherhost:9200, another:9200, 127.0.10.\*:9200, localhost:\*）。

具体使用可参考 [Reindex from Remoteedit](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-reindex.html#reindex-from-remote)

### Elasticsearch-Dump

Elasticsearch-Dump 是一个 elasticsearch 数据导入导出开源工具包。安装、迁移相关执行可以在相同可用区的云主机上进行，使用方便。

需要 node 环境，npm 安装 elasticdump

```bash
npm install elasticdump -g
elasticdump

// Copy an index from production to staging with analyzer and mapping:
elasticdump \
  --input=http://production.es.com:9200/my_index \
  --output=http://staging.es.com:9200/my_index \
  --type=analyzer
elasticdump \
  --input=http://production.es.com:9200/my_index \
  --output=http://staging.es.com:9200/my_index \
  --type=mapping
elasticdump \
  --input=http://production.es.com:9200/my_index \
  --output=http://staging.es.com:9200/my_index \
  --type=data

// Copy a single shard data:
elasticdump \
  --input=http://es.com:9200/api \
  --output=http://es.com:9200/api2 \
  --params='{"preference" : "_shards:0"}'
```

elasticdump 命令其他参数使用参考 [Elasticdump Options](https://github.com/taskrabbit/elasticsearch-dump#options)

## 深度分页

- elasticsearch 超过 10000 条数据的分页查询会报异常，官方提供了 search_after 的方式来支持
- search_after 要求提供上一页两个必须的排序标识

```json
//https://www.elastic.co/guide/en/elasticsearch/reference/5.6/search-request-search-after.html
GET logs/_search
{
  "from":9990,
  "size":10,
  "_source": ["url","clientIp","createdAt"],
  "query":{
    "match_all": {}
  },
  "sort":[
    {
      "createdAt":{
        "order":"desc"
      }
    },
    {
      "_id":{
        "order":"desc"
      }
    }
    ]
}

GET logs/_search
{
  "from":-1,
  "size":10,
  "_source": ["url","clientIp","createdAt"],
  "query":{
    "match_all": {}
  },
  "search_after": [1588042597000, "V363vnEBz1D1HVfYBb0V"],
  "sort":[
    {
      "createdAt":{
        "order":"desc"
      }
    },
    {
      "_id":{
        "order":"desc"
      }
    }
    ]
}
```
