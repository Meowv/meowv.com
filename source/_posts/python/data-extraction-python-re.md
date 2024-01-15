---
title: re模块
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-08 21:34:00
categories: Python
tags:
  - re
  - 数据提取
---

## match

从开始的位置进行匹配，如果开始的位置没有匹配到，就直接匹配失败

```python
text = 'hello'
ret = re.match('h', text)
print(ret.group())
# >> h
```

如果第一个字母不是 h，那么就会失败

```python
text = 'ahello'
ret = re.match('h',text)
print(ret.group())
# >> AttributeError: 'NoneType' object has no attribute 'group'
```

如果想要匹配换行的数据，那么就要传入一个 `flag=re.DOTALL` ，就可以匹配换行符了

```python
text = "abc\nabc"
ret = re.match('abc.*abc',text,re.DOTALL)
print(ret.group())
```

## search

在字符串中找满足条件的字符，如果找到，就返回，就是只会找到第一个满足条件的

```python
text = 'apple price $99 orange price $88'
ret = re.search('\d+',text)
print(ret.group())
# >> 99
```

## group

在正则表达式中，可以对过滤到的字符串进行分组，分组要使用圆括号的方式

- group：和 group\(0\) 是等价的，返回的是整个满足条件的字符串
- groups：返回的是里面的子组，索引从 1 开始
- group\(1\)：返回的是第一个子组，可以传入多个

```python
text = "apple price is $99,orange price is $10"
ret = re.search(r".*(\$\d+).*(\$\d+)",text)
print(ret.group())
print(ret.group(0))
print(ret.group(1))
print(ret.group(2))
print(ret.groups())
```

## findall

找到所有满足条件的，返回的是一个列表

```python
text = 'apple price $99 orange price $88'
ret = re.findall('\d+',text)
print(ret)
# >> ['99', '88']
```

## sub

用来替换字符串，将匹配到的字符串替换为其他字符串

```python
text = 'apple price $99 orange price $88'
ret = re.sub('\d+','0',text)
print(ret)
# >> apple price $0 orange price $0
```

## split

使用正则表达式来分割字符串

```python
text = "hello world ni hao"
ret = re.split('\W',text)
print(ret)
# >> ["hello","world","ni","hao"]
```

## compile

对于一些经常要用到的正则表达式，可以使用 compile 进行编译，后期再使用的时候可以直接拿来使用，执行效率会更快。而且 compile 还可以指定 `flag=re.VERBOSE` ，在写正则表达式的时候可以做好注释

```python
text = "the number is 20.50"
r = re.compile(r"""
                \d+ # 小数点前面的数字
                \.? # 小数点
                \d* # 小数点后面的数字
                """,re.VERBOSE)
ret = re.search(r,text)
print(ret.group())
```
