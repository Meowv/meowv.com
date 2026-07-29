---
title: 一些精简的JavaScript代码集合
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-22 21:10:22
categories: Web
tags:
  - JavaScript
---

## 日历

创建过去七天的数组，如果将代码中的减号换成加号，你将得到未来 7 天的数组集合

```javascript
// 创建过去七天的数组
[...Array(7).keys()].map((days) => new Date(Date.now() - 86400000 * days));
```

## 生成随机 ID

生成长度为 11 的随机字母数字字符串

```javascript
// 生成长度为11的随机字母数字字符串
Math.random().toString(36).substring(2);
```

## 获取 URL 的查询参数

这个获取 URL 的查询参数代码，是我见过最精简的

```javascript
// 获取URL的查询参数
q = {};
location.search.replace(/([^?&=]+)=([^&]+)/g, (_, k, v) => (q[k] = v));
q;
```

## 本地时间

通过一堆 HTML，您可以创建一个本地时间，其中包含您可以一口气读出的源代码，它每秒都会用当前时间更新页面

```javascript
// 创建本地时间
<body onload="setInterval(()=>document.body.innerHTML=new Date().toLocaleString().slice(10,19))"></body>
```

## 数组混淆

随机更改数组元素顺序，混淆数组

`(arr) => arr.slice().sort(() => Math.random() - 0.5)`

```javascript
// 随机更改数组元素顺序，混淆数组
let a = (arr) => arr.slice().sort(() => Math.random() - 0.5);
let b = a([1, 2, 3, 4, 5]);
console.log(b);
```

## 生成随机十六进制代码（生成随机颜色）

使用 JavaScript 简洁代码生成随机十六进制代码

```javascript
// 生成随机十六进制代码 如：'#c618b2'
"#" +
  Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padEnd(6, "0");
```

## 数组去重

这是一个原生的 JS 函数但是非常简洁，Set 接受任何可迭代对象，如数组\[1,2,3,3\]，并删除重复项

```javascript
// 数组去重
[...new Set(arr)];
```

## 创建特定大小的数组

```javascript
[...Array(3).keys()];
// [0, 1, 2]

Array.from({ length: 3 }, (item, index) => index);
// [0, 1, 2]
```

## 返回一个键盘

```javascript
// 用字符串返回一个键盘图形
((_) =>
  [..."`1234567890-=~~QWERTYUIOP[]\\~ASDFGHJKL;'~~ZXCVBNM,./~"].map(
    (x) =>
      ((o += `/${(b = "_".repeat(
        (w =
          x < y
            ? 2
            : " 667699"[
                ((x = ["BS", "TAB", "CAPS", "ENTER"][p++] || "SHIFT"), p)
              ])
      ))}\\|`),
      (m += y + (x + "    ").slice(0, w) + y + y),
      (n += y + b + y + y),
      (l += " __" + b))[73] && (k.push(l, m, n, o), (l = ""), (m = n = o = y)),
    (m = n = o = y = "|"),
    (p = l = k = [])
  ) &&
  k.join`
`)();
```
