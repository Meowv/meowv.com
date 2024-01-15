---
title: Scrapy框架
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-16 19:51:00
categories: Python
tags:
  - Scrapy
  - 爬虫
---

## Scrapy 框架介绍

写一个爬虫，需要做很多的事情，比如：发送网络请求、数据解析、数据存储、反反爬虫机制\(ip 代理，设置请求头等\)、异步请求等等。这些工作如果每次都要自己从零开始写的话，比较浪费时间。因此 scrapy 把一些基础的东西都封装好了，在 scrapy 框架上开发爬虫可以变得更加的高效，爬取效率和开发效率得到提升。

## Scrapy 框架模块功能

- Scrapy Engine（引擎）：Scrapy 框架的核心部分。负责在 Spider 和 ItemPipeline、Downloader、Scheduler 中间通信、传递数据等。
- Spider（爬虫）：发送需要爬取的链接给引擎，最后引擎把其他模块请求回来的数据再发送给爬虫，爬虫就去解析想要的数据。这个部分是我们开发者自己写的，因为要爬取哪些链接，页面中的哪些数据是我们需要的，都是由程序员自己决定。
- Scheduler（调度器）：负责接收引擎发送过来的请求，并按照一定的方式进行排列和整理，负责调度请求的顺序等。
- Downloader（下载器）：负责接收引擎传过来的下载请求，然后去网络上下载对应的数据再交还给引擎。
- Item Pipeline（管道）：负责将 Spider（爬虫）传递过来的数据进行保存。具体保存在哪里，应该看开发者自己的需求。
- Downloader Middlewares（下载中间件）：可以扩展下载器和引擎之间通信功能的中间件。
- Spider Middlewares（Spider 中间件）：可以扩展引擎和爬虫之间通信功能的中间件。

## Scrapy 安装和文档

- 安装：通过 `pip install scrapy` 即可安装。
  - 在 ubuntu 上安装 scrapy 之前，需要先安装以下依赖：`sudo apt-get install python3-dev build-essential python3-pip libxml2-dev libxslt1-dev zlib1g-dev libffi-dev libssl-dev`，然后再通过 `pip install scrapy` 安装。
  - 如果在 windows 系统下，提示这个错误 ModuleNotFoundError: No module named 'win32api'，那么使用以下命令可以解决：`pip install pypiwin32`。
- Scrapy 官方文档：[http://doc.scrapy.org/en/latest](http://doc.scrapy.org/en/latest)
- Scrapy 中文文档：[http://scrapy-chs.readthedocs.io/zh_CN/latest/index.html](http://scrapy-chs.readthedocs.io/zh_CN/latest/index.html)

## Scrapy 快速入门

### 创建项目

要使用 Scrapy 框架创建项目，需要通过命令来创建。首先进入到你想把这个项目存放的目录。然后使用以下命令创建：

`scrapy startproject [项目名称]`

### 目录结构介绍

- items.py：用来存放爬虫爬取下来数据的模型。
- middlewares.py：用来存放各种中间件的文件。
- pipelines.py：用来将 items 的模型存储到本地磁盘中。
- settings.py：本爬虫的一些配置信息（比如请求头、多久发送一次请求、ip 代理池等）。
- scrapy.cfg：项目的配置文件。
- spiders 包：以后所有的爬虫，都是存放到这个里面。

### 使用 Scrapy 框架爬取糗事百科段子例子

#### 使用命令创建一个爬虫

`scrapy gensipder qsbk "qiushibaike.com"`

创建了一个名字叫做 qsbk 的爬虫，并且能爬取的网页只会限制在 qiushibaike.com 这个域名下。

#### 爬虫代码解析

```python
import scrapy

class QsbkSpider(scrapy.Spider):
    name = 'qsbk'
    allowed_domains = ['qiushibaike.com']
    start_urls = ['http://qiushibaike.com/']

    def parse(self, response):
        pass
```

其实这些代码我们完全可以自己手动去写，而不用命令。只不过是不用命令，自己写这些代码比较麻烦。

要创建一个 Spider，那么必须自定义一个类，继承自 scrapy.Spider，然后在这个类中定义三个属性和一个方法。

- name：这个爬虫的名字，名字必须是唯一的。
- allow_domains：允许的域名。爬虫只会爬取这个域名下的网页，其他不是这个域名下的网页会被自动忽略。
- start_urls：爬虫从这个变量中的 url 开始。
- parse：引擎会把下载器下载回来的数据扔给爬虫解析，爬虫再把数据传给这个 parse 方法。这个是个固定的写法。这个方法的作用有两个，第一个是提取想要的数据。第二个是生成下一个请求的 url。

#### 修改 settings.py 代码

在做一个爬虫之前，一定要记得修改 setttings.py 中的设置。两个地方是强烈建议设置的。

- ROBOTSTXT_OBEY 设置为 False。默认是 True。即遵守机器协议，那么在爬虫的时候，scrapy 首先去找 robots.txt 文件，如果没有找到。则直接停止爬取。
- DEFAULT_REQUEST_HEADERS 添加 User-Agent。这个也是告诉服务器，我这个请求是一个正常的请求，不是一个爬虫。

#### 完成的爬虫代码

##### 爬虫部分代码

```python
import scrapy
from scrapy.http.response.html import HtmlResponse
from scrapy.selector.unified import SelectorList
from qsbk.items import QsbkItem

class QsbkSpider(scrapy.Spider):
    name = 'qsbk_spider'
    allowed_domains = ['qiushibaike.com']
    start_urls = ['https://www.qiushibaike.com/text/page/1/']
    base_domain = 'https://www.qiushibaike.com'

    def parse(self, response):
        duanziDivs = contentLeft = response.xpath("//div[@id='content-left']/div")
        for duanzidiv in duanziDivs:
            author = duanzidiv.xpath(".//h2/text()").get().strip()
            content = duanzidiv.xpath(".//div[@class='content']//text()").getall()
            content = "".join(content).strip()

            # duanzi = {"author":author,"content":content}
            # yield duanzi

            item = QsbkItem(author=author,content=content)
            yield item
        next_url = response.xpath("//ul[@class='pagination']/li[last()]/a/@href").get()
        if not next_url:
            return
        else:
            yield scrapy.Request(self.base_domain + next_url, self.parse)
```

##### items.py 部分代码

```python
import scrapy

class QsbkItem(scrapy.Item):
    author = scrapy.Field()
    content = scrapy.Field()
```

##### pipeline 部分代码

```python
# 方式1
import json
class QsbkPipeline(object):
    def __init__(self):
        self.fp = open("duanzi.josn", 'w', encoding='utf-8')

    def open_spider(self, spider):
        print('start...')

    def process_item(self, item, spider):
        item_json = json.dumps(dict(item), ensure_ascii=False)
        self.fp.write(item_json+ '\n')
        return item

    def close_spider(self, spider):
        self.fp.close()
        print('end...')

# 方式2
from scrapy.exporters import JsonItemExporter
class QsbkPipeline(object):
    def __init__(self):
        self.fp = open("duanzi.josn", 'wb')
        self.exporter = JsonItemExporter(self.fp, ensure_ascii=False, encoding='utf-8')
        self.exporter.start_exporting()

    def open_spider(self, spider):
        print('start...')

    def process_item(self, item, spider):
        self.exporter.export_item(item)
        return item

    def close_spider(self, spider):
        self.exporter.finish_exporting()
        self.fp.close()
        print('end...')

# 方式3
from scrapy.exporters import JsonLinesItemExporter
class QsbkPipeline(object):
    def __init__(self):
        self.fp = open("duanzi.josn", 'wb')
        self.exporter = JsonLinesItemExporter(self.fp, ensure_ascii=False, encoding='utf-8')

    def open_spider(self, spider):
        print('start...')

    def process_item(self, item, spider):
        self.exporter.export_item(item)
        return item

    def close_spider(self, spider):
        self.fp.close()
        print('end...')
```

#### 运行 scrapy 项目

运行 scrapy 项目。需要在终端，进入项目所在的路径，然后 `scrapy crawl [爬虫名字]` 即可运行指定的爬虫。如果不想每次都在命令行中运行，那么可以把这个命令写在一个文件中。以后就在 pycharm 中执行运行这个文件就可以了。比如现在新创建一个文件叫做 start.py，然后在这个文件中填入以下代码：

```python
from scrapy import cmdline

cmdline.execute("scrapy crawl qsbk".split())
```

## JsonItemExporter 和 JsonLinesItemExporter

- 保存 json 数据的时候，可以使用这两个类，让操作变得更简单
- `JsonItemExporter`：每次把数据添加到内存中，最后统一写入磁盘，存储的数据是一个满足 json 规则的数据，数据量比较大，比较耗内存
- `JsonLinesItemExporter`：每次调用`export_item`的时候把这个 item 存储到磁盘，每一个字典是一行，整个文件不是一个满足 json 格式的文件，每次处理初级的时候直接存储到硬盘，不耗内存，数据比较安全

## Scrapy 爬虫注意事项

- response 是一个`from scrapy.http.response.html.HtmlResponse`对象，可以执行`xpath`和`css`语法提取数据
- 提取出来的数据是一个`Selector`或者`SelectorList`对象，如果想要获取其中的字符串，应该执行`getall`或者`get`方法
- getall 方法：获取`Selector`中所有文本，返回的是一个列表
- get 方法：获取的是`Selector`中的第一个文本，返回的是 str 类型
- 如果数据解析回来要传给 pipelines 处理，可以使用`yield`来返回，或者是添加所有的 item，统一使用`return`返回
- item：在`item.py`中定义好模型，不要使用字典
- pipelines：这个是专门一从来保存数据的，其中有三个方法是会被经常用到的。要激活 pipelines，应该在`settings.py`中，设置`ITEM_PIPELINES`
  - `open_spider`：当爬虫被打开的时候执行
  - `process_item`：当爬虫有 item 传过来的时候会被调用
  - `close_spider`：当爬虫关闭的时候被调用

## CrawlSpider

在糗事百科的爬虫案例中。我们是自己在解析完整个页面后获取下一页的 url，然后重新发送一个请求。有时候我们想要这样做，只要满足某个条件的 url，都给我进行爬取。那么这时候我们就可以通过 CrawlSpider 来帮我们完成了。CrawlSpider 继承自 Spider，只不过是在之前的基础之上增加了新的功能，可以定义爬取的 url 的规则，以后 scrapy 碰到满足条件的 url 都进行爬取，而不用手动的 yield Request。

## 创建 CrawlSpider 爬虫

之前创建爬虫的方式是通过`scrapy genspider [爬虫名字] [域名]`的方式创建的。如果想要创建 CrawlSpider 爬虫，那么应该通过以下命令创建：

`scrapy genspider -c crawl [爬虫名字] [域名]`

## LinkExtractors 链接提取器

使用 LinkExtractors 可以不用程序员自己提取想要的 url，然后发送请求。这些工作都可以交给 LinkExtractors，他会在所有爬的页面中找到满足规则的 url，实现自动的爬取。

```python
class scrapy.linkextractors.LinkExtractor(
    allow = (),
    deny = (),
    allow_domains = (),
    deny_domains = (),
    deny_extensions = None,
    restrict_xpaths = (),
    tags = ('a','area'),
    attrs = ('href'),
    canonicalize = True,
    unique = True,
    process_value = None
)
```

- allow：允许的 url。所有满足这个正则表达式的 url 都会被提取。
- deny：禁止的 url。所有满足这个正则表达式的 url 都不会被提取。
- allow_domains：允许的域名。只有在这个里面指定的域名的 url 才会被提取。
- deny_domains：禁止的域名。所有在这个里面指定的域名的 url 都不会被提取。
- restrict_xpaths：严格的 xpath。和 allow 共同过滤链接。

## Rule 规则类

定义爬虫的规则类。

```python
class scrapy.spiders.Rule(
    link_extractor,
    callback = None,
    cb_kwargs = None,
    follow = None,
    process_links = None,
    process_request = None
)
```

- link_extractor：一个 LinkExtractor 对象，用于定义爬取规则。
- callback：满足这个规则的 url，应该要执行哪个回调函数。因为 CrawlSpider 使用了 parse 作为回调函数，因此不要覆盖 parse 作为回调函数自己的回调函数。
- follow：指定根据该规则从 response 中提取的链接是否需要跟进。
- process_links：从 link_extractor 中获取到链接后会传递给这个函数，用来过滤不需要爬取的链接。

## Scrapy Shell

我们想要在爬虫中使用 xpath、beautifulsoup、正则表达式、css 选择器等来提取想要的数据。但是因为 scrapy 是一个比较重的框架。每次运行起来都要等待一段时间。因此要去验证我们写的提取规则是否正确，是一个比较麻烦的事情。因此 Scrapy 提供了一个 shell，用来方便的测试规则

打开 cmd 终端，进入到 Scrapy 项目所在的目录，然后进入到 scrapy 框架所在的虚拟环境中，输入命令`scrapy shell [链接]`。就会进入到 scrapy 的 shell 环境中。在这个环境中，你可以跟在爬虫的 parse 方法中一样使用了。
