---
title: 多线程爬虫
author: 阿星𝑷𝒍𝒖𝒔
date: 2019-07-13 21:51:00
categories: Python
tags:
  - 多线程
  - 爬虫
---

有些时候，比如下载图片，是一个比较耗时的操作，如果采用同步的方式去下载，效率肯定会特别慢，这时候我们就可以考虑使用多线程的方式来下载图片

## 多线程介绍

- 多线程是为了同步完成多项任务，通过提高资源使用效率来进一步提高系统的效率
- 线程是在同一时间需要完成多项任务的时候实现的
- 最简单的比喻，多线程就像火车的每一节车厢，而进程则是火车。车厢离开火车是无法跑动的，火车可以有多节车厢
- 多线程的出现就是为了提高效率……

## threading 模块

threading 模块是 python 中专门提供用来做多线程编程的模块，threading 模块中最常用的类是 Thread

```python
import threading
import time

def coding():
    for x in range(3):
        print("coding %s" % x)
        time.sleep(1)

def drawing():
    for x in range(3):
        print("drawing %s" % x)
        time.sleep(1)

def single_thread():
    coding()
    drawing()

def multi_thread():
    t1 = threading.Thread(target=coding)
    t2 = threading.Thread(target=drawing)

    t1.start()
    t2.start()

if __name__ == "__main__":
    multi_thread()
```

## 查看线程函数

使用 `threading.enumerate()` 函数可以看到当前线程的数量

## 查看当前线程的名字

使用 `threading.current_thread()` 可以看到当前线程的信息

## 继承自 threading.Thread 类

为了让线程代码更好的封装，可以使用 threading 模块下的 Thread 类，继承自这个类然后实现 run 方法，线程就会自动运行 run 方法中的代码

```python
import threading
import time

class CodingThread(threading.Thread):
    def run(self):
        for x in range(3):
            print("coding %s" % threading.current_thread())
            time.sleep(1)

class DrawingThread(threading.Thread):
    def run(self):
        for x in range(3):
            print("drawing %s" % threading.current_thread())
            time.sleep(1)

def multi_thread():
    t1 = CodingThread()
    t2 = DrawingThread()

    t1.start()
    t2.start()

if __name__ == "__main__":
    multi_thread()
```

## 多线程共享全局变量的问题

多线程都是在同一个进程中运行的，因此在进程中的全局变量所有线程都是可以共享的，这就会造成一个问题，因为线程执行的顺序是无序的，有可能就会导致数据错误，比如下面代码

```python
import threading

VALUE = 0

def add_value():
    global VALUE
    for x in range(1000000):
        VALUE += 1
    print(VALUE)

def main():
    for x in range(2):
        t = threading.Thread(target=add_value)
        t.start()

if __name__ == "__main__":
    main()
```

以上代码结果正常来讲应该是 2000000，但是因为多线程运行的不确定性，因此最后的结果可能是随机的，于是我们可以使用锁机制解决这个问题

## 锁机制

为了解决以上使用共享全局变量的问题，threading 提供了一个 Lock 类，这个类可以在某个线程访问某个变量的时候加锁，其他线程此时就不能进来，知道当前线程处理完成后，把锁释放，其他线程才能进来处理

```python
import threading

VALUE = 0

lock =  threading.Lock()

def add_value():
    global VALUE
    lock.acquire()
    for x in range(1000000):
        VALUE += 1
    lock.release()

    print(VALUE)

def main():
    for x in range(2):
        t = threading.Thread(target=add_value)
        t.start()

if __name__ == "__main__":
    main()
```

## Lock 版生产者和消费者模式

生产者和消费者模式是多线程开发中经常遇见的一种模式，生产者的线程专门用来生产数据，然后放到中间变量中，消费者再从这个中间的变量中取出数据进行消费，但是因为要使用中间变量，中间变量经常是全局变量，因为需要用锁来保证数据的完整性。

使用 `threading.Lock` 锁实现 生产者和消费者模式例子

```python
import threading
import time
import random

gMoney = 1000
gLock = threading.Lock()
gTotalTimes = 10
gTimes = 0

class Producer(threading.Thread):
    def run(self):
        global gMoney
        global gTimes
        while True:
            money = random.randint(100, 1000)
            gLock.acquire()
            if gTimes >= gTotalTimes:
                gLock.release()
                break
            gMoney += money
            print('%s 生产了%d元钱，剩余%d元钱' % (threading.current_thread(), money, gMoney))
            gTimes += 1
            gLock.release()
            time.sleep(0.5)

class Consumer(threading.Thread):
    def run(self):
        global gMoney
        while True:
            money = random.randint(100, 1000)
            gLock.acquire()
            if gMoney >= money:
                gMoney -= money
                print('%s消费者消费了%d元钱，剩余%d元钱' % (threading.current_thread(), money, gMoney))
            else:
                if gTimes >= gTotalTimes:
                    gLock.release()
                    break
                print('%s消费者准备消费%d元钱，剩余%d元钱，不足！' % (threading.current_thread(), money, gMoney))
            gLock.release()
            time.sleep(0.5)

def main():
    for x in range(3):
        t = Consumer(name='消费者线程%d' % x)
        t.start()

    for x in range(5):
        t = Producer(name='生产者线程%d' % x)
        t.start()

if __name__ == "__main__":
    main()
```

## Condition 版生产者与消费者模式

就上面的例子，Lock 版本的生产者与消费者模式可以正常的运行，但是存在一些不足，在消费者中总是通过 while-True 死循环并且上锁的方式去判断钱够不够。上锁是一个很耗费 CPU 资源行为，因为这种方式不是最好的解决方法，还有一种更好的方式就是使用 `threading.Condition` 来实现

`threading.Condition` 可以在没有数据的时候处于阻塞等待状态，一旦有合适的数据了，还可以使用 `notify` 相关的函数来通知其他处于等待的线程，这样就可以不用做一些无用的上锁和解锁操作，从而可以提高程序的性能

`threading.Condition` 类是 `threading.Lock` ，可以在修改全局数据的时候进行上锁，也可以在修改完毕后进行解锁

- acquire：上锁
- release：解锁
- wait：将当前线程处于等待状态，并且会释放锁。可以被其他线程使用 notify 和 notify_all 函数唤醒。被唤醒后会继续等待上锁，上锁后继续执行下面的代码
- notify：通知某个正在等待的线程，默认是第一个等待的线程
- notify_all：通知所有正在等待的线程，notify 和 notify_all 不会释放锁。并且需要在 release 之前调用

使用 `threading.Condition` 实现生产者和消费者模式例子

```python
import threading
import time
import random

gMoney = 1000
gCondition = threading.Condition()
gTotalTimes = 10
gTimes = 0

class Producer(threading.Thread):
    def run(self):
        global gMoney
        global gTimes
        while True:
            money = random.randint(100, 1000)
            gCondition.acquire()
            if gTimes >= gTotalTimes:
                gCondition.release()
                break
            gMoney += money
            print('%s 生产了%d元钱，剩余%d元钱' % (threading.current_thread(), money, gMoney))
            gTimes += 1
            gCondition.notify_all()
            gCondition.release()
            time.sleep(0.5)

class Consumer(threading.Thread):
    def run(self):
        global gMoney
        while True:
            money = random.randint(100, 1000)
            gCondition.acquire()
            while gMoney < money:
                if gTimes >= gTotalTimes:
                    gCondition.release()
                    return
                else:
                    print('%s消费者准备消费%d元钱，剩余%d元钱，不足！' % (threading.current_thread(), money, gMoney))
                gCondition.wait()
            gMoney -= money
            print('%s消费了%d元钱，剩余%d元钱' % (threading.current_thread(), money, gMoney))
            gCondition.release()
            time.sleep(0.5)

def main():
    for x in range(3):
        t = Consumer(name='消费者线程%d' % x)
        t.start()

    for x in range(5):
        t = Producer(name='生产者线程%d' % x)
        t.start()

if __name__ == "__main__":
    main()
```

## Queue 线程安全队列

在线程中，访问一些全局变量，加锁是一个经常的过程，如果先把一些数据存储在某个队列中，那么 python 内置了一个线程安全的模块叫做 queue 模块，python 中的 queue 模块提供了同步的、线程安全的队列类，包括 FIFO\(先进先出\)队列 Queue，LIFO\(后入先出\)队列 LifeQueue。这些队列都实现了锁原语\(可以理解为原子操作，要么不做，要么都做完\)，能够在多线程中直接使用，可以使用队列来实现线程间的同步

- 初始化 Queue\(maxsize\)：创建一个先进先出的队列
- qsize\(\)：返回队列的大小
- empty\(\)：判断队列是否为空
- full\(\)：判断队列是否满了
- get\(\)：从队列中取最后一个数据
- put\(\)：将一个数据放到队列中

## 使用生产者与消费者模式多线程下载 斗图啦 表情包

```python
import os
import re
import threading
from queue import Queue
from urllib import request

import requests
from lxml import etree

class Procuder(threading.Thread):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36'
    }

    def __init__(self, page_queue, img_queue, *args, **kwargs):
        super(Procuder,self).__init__(*args, **kwargs)
        self.page_queue = page_queue
        self.img_queue = img_queue

    def run(self):
        while True:
            if self.page_queue.empty():
                break
            url = self.page_queue.get()
            self.parse_page(url)

    def parse_page(self, url):
        response = requests.get(url,headers=self.headers)
        text = response.text
        html = etree.HTML(text)

        imgs = html.xpath('//div[@class="page-content text-center"]//img[@class!="gif"]')
        for img in imgs:
            img_url = img.get('data-original')
            img_name = img.get('alt')
            img_name = re.sub(r'[\?？\.，。！!；;\*]', '', img_name)

            img_suffix = os.path.splitext(img_url)[1]
            filename = img_name + img_suffix
            self.img_queue.put((img_url, filename))

class Consumer(threading.Thread):
    def __init__(self, page_queue, img_queue, *args, **kwargs):
        super(Consumer,self).__init__(*args, **kwargs)
        self.page_queue = page_queue
        self.img_queue = img_queue

    def run(self):
        while True:
            if self.img_queue.empty() and self.page_queue.empty():
                break
            img_url, filename = self.img_queue.get()
            request.urlretrieve(img_url, 'images/' + filename)
            print(filename + ' 下载完成!')

def main():
    page_queue = Queue(100)
    img_queue = Queue(1000)

    for x in range(1, 101):
        url = 'https://www.doutula.com/photo/list/?page=%d' % x
        page_queue.put(url)

    for x in range(5):
        t = Procuder(page_queue, img_queue)
        t.start()
    for x in range(5):
        t = Consumer(page_queue, img_queue)
        t.start()

if __name__ == "__main__":
    main()
```

## GIL 全局解释器锁

Python 自带的解释器是 CPython，CPython 解释器的多线程实际上并非真正的多线程\(在多核 CPU 中，只能利用一核，不能利用多核\)。同一时刻只有一个线程在执行，为了保证同一时刻只有一个线程在执行，在 CPython 解释器中有一个东西叫做 GIL\(Global Intepreter Lock\)，叫做全局解释器，这个解释器锁是有必要的，因为 CPython 解释器的内存管理不是线程安全的，当然除了 CPython 解释器，还有其他解释器，有些解释器是没有 GIL 锁的

- Jython：用 Java 实现的 Python 解释器。不存在 GIL 锁
- IronPython：用.net 实现的 Python 解释器。不存在 GIL 锁
- PyPy：用 Python 实现的 Python 解释器。存在 GIL 锁

GIL 虽然是一个假的多线程。但是在处理一些 IO 操作（比如文件读写和网络请求）还是可以在很大程度上提高效率的。在 IO 操作上建议使用多线程提高效率。在一些 CPU 计算操作上不建议使用多线程，而建议使用多进程

## 多线程爬取百思不得姐段子数据

```python
import csv
import threading
from queue import Queue

import requests
from lxml import etree


class budejieSpider(threading.Thread):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36'
    }
    def __init__(self, page_queue, joke_queue, *args,  **kwargs):
        super(budejieSpider, self).__init__(*args,  **kwargs)
        self.base_domain = "http://www.budejie.com"
        self.page_queue = page_queue
        self.joke_queue = joke_queue

    def run(self):
        while True:
            if self.page_queue.empty():
                break
            url = self.page_queue.get()
            response = requests.get(url, headers=self.headers)
            text = response.text
            html = etree.HTML(text)
            descs = html.xpath("//div[@class='j-r-list-c-desc']")
            for desc in descs:
                jokes = desc.xpath(".//text()")
                joke = "\n".join(jokes).strip()
                link = self.base_domain+desc.xpath(".//a/@href")[0]
                self.joke_queue.put((joke, link))
            print('第%s页下载完成！' % url.split('/')[-1])

class budejieWriter(threading.Thread):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36'
    }

    def __init__(self, joke_queue, writer, gLock, *args,  **kwargs):
        super(budejieWriter, self).__init__(*args,  **kwargs)
        self.joke_queue = joke_queue
        self.writer = writer
        self.lock = gLock

    def run(self):
        while True:
            try:
                joke_info = self.joke_queue.get(timeout=40)
                joke, link = joke_info
                self.lock.acquire()
                self.writer.writerow((joke, link))
                self.lock.release()
                print('保存一条.')
            except:
                pass

def main():
    page_queue = Queue(10)
    joke_queue = Queue(500)
    gLock = threading.Lock()
    fp = open('budejie.csv', 'a', newline='', encoding='utf-8')
    writer = csv.writer(fp)
    writer.writerow(('content', 'link'))

    for x in range(1, 11):
        url = 'http://www.budejie.com/text/%d' % x
        page_queue.put(url)

    for x in range(5):
        t = budejieSpider(page_queue, joke_queue)
        t.start()

    for x  in range(5):
        t = budejieWriter(joke_queue, writer, gLock)
        t.start()

if __name__ == "__main__":
    main()
```
