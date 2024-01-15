---
title: json文件处理
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-09 22:45:00
categories: Python
tags:
  - json
  - 数据存储
---

## 什么是 json

JSON\(JavaScript Object Notation, JS 对象标记\) 是一种轻量级的数据交换格式。它基于 ECMAScript \(w3c 制定的 js 规范\)的一个子集，采用完全独立于编程语言的文本格式来存储和表示数据。简洁和清晰的层次结构使得 JSON 成为理想的数据交换语言。 易于人阅读和编写，同时也易于机器解析和生成，并有效地提升网络传输效率。

## json 支持的数据格式

- 对象\(字典\)，使用花括号
- 数组\(列表\)，使用方括号
- 整型、浮点型、布尔型、NULL 类型
- 字符串类型\(字符串必须要用双引号，不能用单引号\)
- 多个数据之间使用逗号分开
- json 本质上还是一个字符串

## 字典和列表转 json

```python
import json

books = {
    {
        'title': '钢铁是怎样练成的',
        'price': 9.8
    },
    {
        'title': '红楼梦',
        'price': 9.9
    }
}

json_str = json.dumps(books, ensure_ascii=False)
print(json_str)
```

- 因为 json 在 dump 的时候，只能存放 ascii 的字符，因为会将中文进行转义，这时候我们可以使用 `ensure_ascii=False` 关闭这个特性。
- 在 python 中，只有基本数据类型才能转换成 json 格式的字符串，int、float、str、list、dict、tuple

## 将 json 数据直接 dump 到文件中

json 模块中除了 dumps 函数，还有一个 dump 函数，这个函数可以传入一个文件指针，直接将字符串 dump 到文件中

```python
import json

books = {
    {
        'title': '钢铁是怎样练成的',
        'price': 9.8
    },
    {
        'title': '红楼梦',
        'price': 9.9
    }
}

with open('books.json', 'w') as fp:
    json.dump(books, fp)
```

## 将一个 json 字符串 load 成 python 对象

```python
import json

json_str = '[{"title": "钢铁是怎样练成的", "price": 9.8}, {"title": "红楼梦", "price": 9.9}]'

books = json.loads(json_str, encoding='utf-8')
print(type(books)) # <class 'list'>
print(books)
```

## 直接从文件中读取 json 数据

```python
import json

with open('books.json','r',encoding='utf-8') as fp:
    json_str = json.load(fp)
    print(json_str)
```
