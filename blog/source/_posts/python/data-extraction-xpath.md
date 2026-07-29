---
title: XPath语法
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-04 22:34:00
categories: Python
tags:
  - XPath
  - 数据提取
---

## 什么是 Xpath

XPath\(XML Path Language\) 是一门在 XML 和 HTML 文档中查找信息的语言，可以用来在 XML 和 HTML 文档中对元素和属性进行遍历

## XPath 工具

- Chrome 插件 [XPath Helper](https://chrome.google.com/webstore/detail/xpath-helper/hgimnogjllphhhkhlmebbmlgjoejdpjl)
- Firefox 插件 [Try XPath](https://addons.mozilla.org/en-US/firefox/addon/try-xpath/)

## XPath 的语法

### 选取节点

XPath 使用路径表达式来选取 XML 文档中的节点或者节点集，这些路径表达式和我们在常规的电脑文件系统中看到的表达式非常相似

| 表达式   | 描述                                                         | 示例             | 结果                                |
| :------- | :----------------------------------------------------------- | :--------------- | :---------------------------------- |
| nodename | 选取此节点的所有子节点                                       | `bookstore`      | 选取 bookstore 下所有的子节点       |
| /        | 如果是在最前面，代表从根节点选取，否则选择某节点下的某个节点 | `/bookstore`     | 选取根元素下所有的 bookstore 节点   |
| //       | 从全局节点中选择节点，随意在哪个位置                         | `//book`         | 从全局节点中找到所有的 book 节点    |
| @        | 选取某个节点的属性                                           | `//book[@price]` | 选择所有拥有 price 属性的 book 节点 |
| .        | 当前节点                                                     | `./a`            | 选取当前节点下的 a 标签             |

### 谓语

谓语用来查找某个特定的节点或者包含某个指定的值的及诶按，被嵌在括号中使用

| 路径表达式                       | 描述                                        |
| :------------------------------- | :------------------------------------------ |
| `//bookstore/book[1]`            | 选取 bookstore 下的第一个 book 子元素       |
| `//bookstore/book[last()]`       | 选取 bookstore 下最后一个 book 子元素       |
| `//bookstore/book[position()<3]` | 选取 bookstore 下前面两个 book 子元素       |
| `//book[@price]`                 | 选取拥有 price 属性的 book 元素             |
| `//book[@price=10]`              | 选取拥有 price 属性并且等于 10 的 book 元素 |

### 通配符

在 XPath 中用 `*` 来表示通配符

| 通配符 | 描述                 | 示例           | 结果                          |
| :----- | :------------------- | :------------- | :---------------------------- |
| `*`    | 匹配任意节点         | `/bookstore/*` | 选取 bookstore 下的所有子元素 |
| `@*`   | 匹配节点中的任意属性 | `//book[@*]`   | 选取所有带属性的 book 元素    |

### 选取多个路径

通过在路径表达式中使用 `|` 运算符，可以选取若干个路径，比如选取所有 book 元素已经 book 元素下所有的 title 元素 `//bookstore/book | //book/title`
