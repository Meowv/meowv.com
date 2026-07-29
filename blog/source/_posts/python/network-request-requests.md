---
title: requests库
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-03 21:15:00
categories: Python
tags:
  - requests
  - 网络请求
---

## requests

虽然 Python 的标准库中 urllib 模块已经包含了平常我们使用的大多数功能，但是它的 API 使用起来让人感觉不太好，而 Requests 宣传是 “HTTP for Humans”，说明使用更简洁方便。

### 安装和文档地址

```python
pip install requests
```

- 中文文档：[http://docs.python-requests.org/zh_CN/latest/index.html](http://docs.python-requests.org/zh_CN/latest/index.html)
- github 地址：[https://github.com/requests/requests](https://github.com/requests/requests)

### 发送 GET 请求

- 最简单的发送 get 请求就是通过 request.get 来调用

  ```python
  response = request.get('http://www.baidu.com/')
  ```

- 添加 header 和查询参数，如果想要添加 headers，可以传入 headers 参数来增加请求头中的 headers 信息，如果要将参数放在 url 中传递，可以利用 params 参数

```python
import requests
kw = {'wd': '中国'}
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36'
}

# params 接受一个字典或者字符串的查询参数，字典类型自动转换为url编码，不需要urlencode()
response = request.get('http://www.baidu.com/s', params=kw, headers=headers)

# 查看响应内容，response.text 返回的是Unicode格式的数据
print(response.text)

# 查看响应内容，response.content 返回的是字节流数据
print(response.content)

# 查看完整url地址
print(response.url)

# 查看响应头部字符编码
print(response.encoding)

# 查看响应码
print(response.status_code)
```

### 发送 POST 请求

- 最基本的 post 请求可以使用 post 方法

  ```python
  response = request.post('http://www.baidu,com', data=data)
  ```

- 传入 data 数据，这时候就不需要 urlencode 进行编码了，直接传入一个字典进去就可以了

  ```python
  import requests
  url = 'https://www.lagou.com/jobs/positionAjax.json?city=%E6%B7%B1%E5%9C%B3&needAddtionalResult=false&isSchoolJob=0'
  headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36',
    'Referer': 'https://www.lagou.com/jobs/list_python?labelWords=&fromSearch=true&suginput='
  }
  data = {
    'first': 'true',
    'pn': 1,
    'kd': 'python'
  }
  resp = requests.post(url, headers=headers, data=data)
  # 如果是json数据，直接可以调用json方法
  print(resp.json())
  ```

### 使用代理

使用 requests 添加代理，只需要在请求的方法中传递 proxies 参数就可以了

```python
import requests
url = 'http://httpbin.org/get'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36'
}
proxy = {
    'http': '132.232.126.92'
}

resp = requests.get(url, headers=headers, proxies=proxy)
with open('http.html', 'w', encoding='utf-8') as fp:
    fp.write(resp.text)
```

### cookie

如果在一个响应中包含了 cookie，那么可以利用 cookie 属性拿到这个返回的 cookie 值

```python
import requests

resp = requests.get('http://www.baidu.com/')
print(resp.cookies)
print(resp.cookies.get_dict())
```

### session

- urllib 库，是可以使用 opener 发送多个请求，多个请求之间是可以共享 cookie 的。
- 使用 requests，也要达到共享 cookie 的目的，可以用 requests 库提供的 session 对象。这里的 session 不是 web 开发中的 session，这里只是一个会话的对象。

```python
import requests

url = 'http://www.renren.com/PLogin.do'
data = {'email':'','password':''}
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36'
}

# 登录
session = requests.session()
session.post(url, data=data, headers=headers)

# 访问个人主页
resp = session.get('http://www.renren.com/971368245/profile')
print(resp.text)
```

### 处理不受信任的 SSL 证书

对于那些已经被信任的 SSL 整数的网站，比如 [https://www.baidu.com/](https://www.baidu.com/) ，那么使用 requests 直接就可以正常的返回响应，对于不受信任的网站，添加 verify=False 参数

```python
url = 'https://xxx.com'
resp = requests.get(url,verify=False)
print(resp.content.decode('utf-8'))
```
