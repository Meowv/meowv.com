---
title: 图形验证码识别
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-15 23:22:00
categories: Python
tags:
  - Tesseract
  - 验证码
  - 爬虫
---

## 图形验证码识别技术

阻碍我们爬虫的。有时候正是在登录或者请求一些数据时候的图形验证码。因此这里我们讲解一种能将图片翻译成文字的技术。将图片翻译成文字一般被成为光学文字识别（Optical Character Recognition），简写为 OCR。实现 OCR 的库不是很多，特别是开源的。因为这块存在一定的技术壁垒（需要大量的数据、算法、机器学习、深度学习知识等），并且如果做好了具有很高的商业价值。因此开源的比较少。这里介绍一个比较优秀的图像识别开源库：Tesseract。

## Tesseract

Tesseract 是一个 OCR 库，目前由谷歌赞助。Tesseract 是目前公认最优秀、最准确的开源 OCR 库。Tesseract 具有很高的识别度，也具有很高的灵活性，他可以通过训练识别任何字体。

## 安装

### Windows

在 [https://github.com/tesseract-ocr/](https://github.com/tesseract-ocr/) 下载可执行文件，然后一顿点击下一步安装即可，放在不需要权限的纯英文路径下

### Linux

可以在 [https://github.com/tesseract-ocr/tesseract/wiki/Compiling](https://github.com/tesseract-ocr/tesseract/wiki/Compiling) 下载源码自行编译，或者\(ubuntu 下\)通过以下命令进行安装 `sudo apt install tesseract-ocr`

### Mac

用 Homebrew 即可方便安装，`brew install tesseract`

## 设置环境变量

安装完成后，如果想要在命令行中使用 Tesseract，那么应该设置环境变量。Mac 和 Linux 在安装的时候就默认已经设置好了。在 Windows 下把 tesseract.exe 所在的路径添加到 PATH 环境变量中。

还有一个环境变量需要设置的是，要把训练的数据文件路径也放到环境变量中

在环境变量中，添加一个 TESSDATA_PREFIX=~~~\teseractdata

## 在命令行中使用 tesseract 识别图像

如果想要在 cmd 下能够使用 tesseract 命令，那么需要把 tesseract.exe 所在的目录放到 PATH 环境变量中。然后使用命令：tesseract 图片路径 文件路径。

`tesseract a.png a`

那么就会识别出 a.png 中的图片，并且把文字写入到 a.txt 中。如果不想写入文件直接想显示在终端，那么不要加文件名就可以了。

## 在代码中使用 tesseract 识别图像

在 Python 代码中操作 tesseract。需要安装一个库，叫做 pytesseract。通过 pip 的方式即可安装：

`pip install pytesseract`

并且，需要读取图片，需要借助一个第三方库叫做 PIL。通过 pip list 看下是否安装。如果没有安装，通过 pip 的方式安装：

`pip install PIL`

使用 pytesseract 将图片上的文字转换为文本文字

```python
# 导入pytesseract库
import pytesseract
# 导入Image库
from PIL import Image

# 指定tesseract.exe所在的路径
pytesseract.pytesseract.tesseract_cmd = r'D:\Program Files\Tesseract-OCR\tesseract.exe'

# 打开图片
image = Image.open("a.png")
# 调用image_to_string将图片转换为文字
text = pytesseract.image_to_string(image, lang='chi_sim')
print(text)
```

## 用 pytesseract 自动识别图形验证码

```python
import time
from urllib import request

import pytesseract
from PIL import Image

def main():
    pytesseract.pytesseract.tesseract_cmd = r'D:\Program Files\Tesseract-OCR\tesseract.exe'
    while True:
        url = 'https://e.coding.net/api/getCaptcha'
        request.urlretrieve(url, 'captcha.png')
        image = Image.open('captcha.png')
        text = pytesseract.image_to_string(image)
        print(text)
        time.sleep(2)

if __name__ == "__main__":
    main()
```
