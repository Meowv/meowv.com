---
title: HTTP协议
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-01 19:14:00
categories: Python
tags:
  - HTTP
  - 网络请求
---

## http 和 https

- http 协议：全称是 HyperText Transfer Protocol，意思是超文本传输协议，是一种发布和接收 HTML 页面的方法，服务器端口号是 80。
- https 协议：是 HTTP 协议的加密版本，在 HTTP 下加入了 SSL 层，服务器端口号是 443。

### 在浏览器中发送一个 http 请求的过程

- 当用户在浏览器地址栏钟输入一个 URL 访问之后，浏览器会向服务器发送 HTTP 请求，http 请求主要分为 "GET" 和 "POST"。
- 比如当我们在浏览器输入 URL [http://baidu.com](http://baidu.com) 的时候，浏览器发一个 Request 请求去获取 [http://baidu.com](http://baidu.com) 的 HTML 文件，服务器把 Response 文件对象返回给浏览器。
- 浏览器分析 Response 中的 HTML，发现其中引用了很多其他文件，如图片、css、js 等，浏览器会自动再次发送 Request 去获取这些文件。
- 当所有文件都下载成功，网页会根据 HTML 语法结构，完整显示出来。

## URL 组成

URL 是 Uniform Resource Locator 的简写，统一资源定位符。 一个 URL 由以下几部分组成：

- schema：代表访问的协议，一般为 http、https、ftp
- host：主机名，域名，比如 www.baidu.com
- post：端口号，当访问一个网站的时候，http 默认使用 80，https 默认使用 443
- path：查找路径，比如 www.baidu.com/search/error.html , search/error.html 就是 path
- query-string：查询字符串，比如 www.baidu.com/s?wd=python wd=python 就是查询字符串
- anchor：锚点，前端用来做页面定位用

在浏览器中请求一个 URL，浏览器会对这个 url 进行编码，除了英文字母、数字和不分符号外，其他全部使用百分号加十六进制值进行编码

## GET 和 POST

在 HTTP 协议中定义了 8 种请求方法

- GET：一般情况下，只从服务器获取数据下来，并不会对服务器资源产生任何影响的时候会用 GET 请求
- POST：向服务器发送数据、上传文件，会对服务器资源产生影响的时候会使用 POST 请求

以上是网站开发中常用的两种方法，一般情况下都会遵循使用原则，但是有些网站和服务器为了做反爬虫机制，也经常不按常理出牌，要视情况而定。

## 请求头常见参数

在 HTTP 协议中，向服务器发送一个请求，数据分为三个部分，第一个是把数据放在 URL 中，第二个是把数据放在 body 中\(POST 请求\)，第三个就是把数据放在 head 中

- User-Agent：浏览器名称。这个在网络爬虫中经常会被使用到，请求一个网页的时候，服务器通过这个参数就可以知道当前请求是由哪种浏览器发送的，如果我们通过 Python 爬虫发送请求，那么 User-Agent 就是 Python，这对于那些有反爬虫机制的网站来说，可以轻易判断请求是爬虫。因为我们需要设置这个值为一些浏览器的值，来伪装爬虫。
- Referer：表明当前这个请求是从哪个 URL 过来的。这个一般也可以用来做反爬虫技术。如果不是从指定页面过来的，那么就不做响应的响应。
- Cookie：HTTP 协议是无状态的。同一个人发送了两次请求，服务器没有能力知道这两个请求是否来自同一个人，因此需要用 Cookie 来做标识，一般如果想要做登录后才能访问的网站，那么就需要发送 Cookie 信息了。

## 常见响应状态码

- 200 OK：客户端请求成功
- 400 Bad Request：客户端请求有语法错误，不能被服务器所理解
- 401 Unauthorized：请求未经授权，这个状态代码必须和 WWW-Authenticate 报头域一起使用
- 403 Forbidden：服务器收到请求，但是拒绝提供服务
- 404 Not Found：请求资源不存在
- 500 Internal Server Error：服务器发生不可预期的错误
- 503 Server Unavailable：服务器当前不能出来客户端的请求，一段时间后可能恢复正常
