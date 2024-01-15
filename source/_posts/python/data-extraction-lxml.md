---
title: lxml库
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-05 23:19:00
categories: Python
tags:
  - lxml
  - 数据提取
---

## lxml 介绍

- lxml 是一个 HTML/XML 的解析器，主要的功能是如何解析和提取 HTML/XML 数据
- lxml 和正则一样，用 C 语言实现的，是一款高性能的 Python HTML/XML 解析器，可以利用 XPath 语法，快速定位元素以及节点的信息
- lxml Python 官方文档：[https://lxml.de/index.html](https://lxml.de/index.html)
- 安装命令：`pip install lxml`

### 基本使用

可以利用 lxml 解析 HTML 代码，并且在解析 HTML 代码的时候，如果 HTML 代码不规范，缺少标签，lxml 会帮我们自动的进行补全

```python
# 使用lxml的etree库
from lxml import etree

text = """
    <div>
        <ul>
            <li class="item-0"><a href="link1.html">first item</a></li>
            <li class="item-1"><a href="link2.html">second item</a></li>
            <li class="item-inactive"><a href="link3.html">third item</a></li>
            <li class="item-1"><a href="link4.html">fourth item</a></li>
            <li class="item-0"><a href="link5.html">fifth item</a>
            # 注意，此处缺少一个 </li> 闭合标签
        </ul>
    </div
"""

# 利用etree.HTML，将字符串解析为HTML文档
html = etree.HTML(text)

# 按字符串序列化HTML文档
result = etree.tostring(html)

print(result)
```

输出结果如下，可以看到 lxml 会自动修改 HTML 代码，不仅补全了 li 标签，还添加了 body,html 标签

```html
<html>
  <body>
    <div>
      <ul>
        <li class="item-0"><a href="link1.html">first item</a></li>
        <li class="item-1"><a href="link2.html">second item</a></li>
        <li class="item-inactive"><a href="link3.html">third item</a></li>
        <li class="item-1"><a href="link4.html">fourth item</a></li>
        <li class="item-0"><a href="link5.html">fifth item</a></li>
      </ul>
    </div>
  </body>
</html>
```

### 从文件中读取 HTML 代码

除了直接使用字符串进行解析，lxml 还支持冲文件中读取内容，新建一个 hello.html 文件，内容如下，然后利用 `etree.parse()` 方法来读取文件

```html
<div>
  <ul>
    <li class="item-0"><a href="link1.html">first item</a></li>
    <li class="item-1"><a href="link2.html">second item</a></li>
    <li class="item-inactive">
      <a href="link3.html"><span class="bold">third item</span></a>
    </li>
    <li class="item-1"><a href="link4.html">fourth item</a></li>
    <li class="item-0"><a href="link5.html">fifth item</a></li>
  </ul>
</div>
```

```python
from lxml import etree

# 读取HTML文件
html = etree.parse('hello.html')
result = etree.tostring(html, pretty_print=True)

# 输出结果和之前相同
print(result)
```

### 在 lxml 中使用 XPath 语法

- 获取所有 li 标签

```python
from lxml import etree

html = etree.parse('hello.html')
print(type(html)) # 显示 etree.parse() 返回类型

result = html.xpath('//li')

print(result) # 打印 <li> 标签的元素集合
```

- 获取所有 li 元素下的所有 class 属性的值

```python
from lxml import etree

html = etree.parse('hello.html')

result = html.xpath('//li/@class')

print(result)
```

- 获取所有 li 标签下 href 为 link1.html 的 a 标签

```python
from lxml import etree

html = etree.parse('hello.html')

result = html.xpath('//li/a[@href="link1.html"]')

print(result)
```

- 获取 li 标签下所有 span 标签

```python
from lxml import etree

html = etree.parse('hello.html')

result = html.xpath('//li//span')
# //li/span 是不对的，因为 / 是用来获取子元素的，span 并不是 li 的子元素，所有要用双斜杠

print(result)
```

- 获取 li 标签下的 a 标签里的所有 class

```python
from lxml import etree

html = etree.parse('hello.html')

result = html.xpath('//li/a//@class')

print(result)
```

- 获取最后一个 li 的 a 的 href 属性对应的值

```python
from lxml import etree

html = etree.parse('hello.html')

result = html.xpath('//li[last()]/a/@href')

print(result)
```

- 获取倒数第二个 li 元素的内容

```python
from lxml import etree

html = etree.parse('hello.html')

result = html.xpath('//li[last()-1]/a')
# result = html.xpath('//li[last()-1]/a/text()')

print(result)
```

## 案例：使用 requests 和 xpath 爬取电影天堂

```python
from lxml import etree
import requests

BASE_DOMAIN = 'https://www.dytt8.net'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36'
}

def get_detail_urls(url):
    response = requests.get(url, headers=HEADERS)

    text = response.text
    html = etree.HTML(text)

    detail_urls = html.xpath("//table[@class='tbspan']//a/@href")
    detail_urls = map(lambda url: BASE_DOMAIN + url, detail_urls)

    return detail_urls

def parse_detail_page(url):
    movie = {}

    response = requests.get(url, headers=HEADERS)
    text = response.content.decode('gbk')

    html = etree.HTML(text)

    def parse_info(info, rule):
        return info.replace(rule, "").strip()

    title = html.xpath("//div[@class='title_all']//font[@color='#07519a']/text()")[0]
    movie['title'] = title

    zoomE = html.xpath("//div[@id='Zoom']")[0]
    imgs = zoomE.xpath(".//img/@src")
    cover = imgs[0]
    screenshot = imgs[1]
    movie['cover'] = cover
    movie['screenshot'] = screenshot

    infos = zoomE.xpath(".//text()")
    for index, info in enumerate(infos):
        if info.startswith('◎年　　代'):
            info = parse_info(info, '◎年　　代')
            movie["year"] = info
        elif info.startswith('◎产　　地'):
            info = parse_info(info, '◎产　　地')
            movie["country"] = info
        elif info.startswith('◎类　　别'):
            info = parse_info(info, '◎类　　别')
            movie["category"] = info
        elif info.startswith('◎豆瓣评分'):
            info = parse_info(info, '◎豆瓣评分')
            movie["rating"] = info
        elif info.startswith('◎片　　长'):
            info = parse_info(info, '◎片　　长')
            movie["duration"] = info
        elif info.startswith('◎导　　演'):
            info = parse_info(info, '◎导　　演')
            movie["director"] = info
        elif info.startswith('◎主　　演'):
            info = parse_info(info, '◎主　　演')
            actors = [info]
            for x in range(index+1, len(infos)):
                actor = infos[x].strip()
                if actor.startswith('◎'):
                    break
                actors.append(actor)
            movie["actors"] = actors
        elif info.startswith('◎简　　介 '):
            info = parse_info(info, '◎简　　介')
            for x in range(index+1, len(infos)):
                profile = infos[x].strip()
                movie["profile"] = profile

    download_url = html.xpath("//td[@bgcolor='#fdfddf']/a/@href")[0]
    movie["download_url"] = download_url
    return movie

def spider():
    base_url = 'https://www.dytt8.net/html/gndy/dyzz/list_23_{}.html'
    for x in range(1, 3):
        url = base_url.format(x)
        detail_urls = get_detail_urls(url)
        for detial_url in detail_urls:
            movie = parse_detail_page(detial_url)
            print(movie)

if __name__ == "__main__":
    spider()
```
