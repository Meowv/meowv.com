# -*- coding: utf-8 -*-

import json
import threading
import urllib.parse
from queue import Queue

import requests
from lxml import etree

SOURCE = {
    "cnblogs": 1,
    "v2ex": 2,
    "segmentfault": 3,
    "juejin": 4,
    "weixin": 5,
    "douban": 6,
    "ithome": 7,
    "36kr": 8,
    "tieba": 9,
    "baidu": 10,
    "weibo": 11,
    "zhihu": 12,
    "zhihudaily": 13,
    "163news": 14,
    "github": 15,
    "douyin_hot": 16,
    "douyin_video": 17,
    "douyin_positive": 18
}

lock = threading.Lock()

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36'
}

# 博客园
class cnblogs_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://www.cnblogs.com'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.text)

        titles = html.xpath("//div[@class='post_item_body']/h3/a/text()")
        urls = html.xpath("//div[@class='post_item_body']/h3/a/@href")

        save_data(titles, urls, SOURCE['cnblogs'])

# V2EX
class v2ex_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://www.v2ex.com/?tab=hot'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.text)

        titles = html.xpath("//span[@class='item_title']/a/text()")
        urls = html.xpath("//span[@class='item_title']/a/@href")
        urls = list(map(lambda x: "https://www.v2ex.com" + x, urls))

        save_data(titles, urls, SOURCE['v2ex'])

# SegmentFault
class segmentfault_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://segmentfault.com/hottest'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.text)

        titles = html.xpath(
            "//div[@class='news__item-info clearfix']/a/div/h4/text()")
        urls = html.xpath("//div[@class='news__item-info clearfix']/a/@href")
        urls = list(map(lambda x: "https://segmentfault.com" + x, urls))

        save_data(titles, urls, SOURCE['segmentfault'])

# 掘金
class juejin_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://web-api.juejin.im/query'

        HEADERS['X-Agent'] = 'Juejin/Web'
        DATA = {
            "extensions": {
                "query": {
                    "id": "21207e9ddb1de777adeaca7a2fb38030"
                }
            },
            "operationName": "",
            "query": "",
            "variables": {
                "first": 20,
                "after": "",
                "order": "THREE_DAYS_HOTTEST"
            }
        }

        response = requests.post(url, headers=HEADERS, json=DATA)
        json_result = response.json()
        json_data = json_result['data']['articleFeed']['items']['edges']

        titles = []
        urls = []

        for x in json_data:
            titles.append(x['node']['title'])
            urls.append(x['node']['originalUrl'])

        save_data(titles, urls, SOURCE['juejin'])

# 微信热门
class weixin_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://weixin.sogou.com'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.content.decode('utf-8'))

        titles = html.xpath(
            "//ul[@class='news-list']/li/div[@class='txt-box']/h3/a/text()")
        urls = html.xpath(
            "//ul[@class='news-list']/li/div[@class='txt-box']/h3/a/@href")

        save_data(titles, urls, SOURCE['weixin'])

# 豆瓣精选
class douban_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://www.douban.com/group/explore'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.text)

        titles = html.xpath(
            "//div[@class='channel-item']/div[@class='bd']/h3/a/text()")
        urls = html.xpath(
            "//div[@class='channel-item']/div[@class='bd']/h3/a/@href")

        save_data(titles, urls, SOURCE['douban'])

# IT之家
class ithome_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://www.ithome.com'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.content.decode('utf-8'))

        titles = html.xpath(
            "//div[@class='lst lst-2 hot-list']/div[1]/ul/li/a[@title]/text()")
        urls = html.xpath(
            "//div[@class='lst lst-2 hot-list']/div[1]/ul/li/a/@href")

        save_data(titles, urls, SOURCE['ithome'])

# 36氪
class kr36_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://36kr.com/newsflashes'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.content.decode('utf-8'))

        titles = html.xpath(
            "//div[@class='hotlist-main']/div//a//text()")
        urls = html.xpath(
            "//div[@class='hotlist-main']/div[@class='hotlist-item-toptwo']/a[1]/@href|//div[@class='hotlist-main']/div[@class='hotlist-item-other clearfloat']/div[@class='hotlist-item-other-info']/a/@href")
        urls = list(map(lambda x: "https://36kr.com" + x, urls))

        save_data(titles, urls, SOURCE['36kr'])

# 百度贴吧
class tieba_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'http://tieba.baidu.com/hottopic/browse/topicList'
        response = requests.get(url, headers=HEADERS)
        json_result = response.json()

        json_data = json_result['data']['bang_topic']['topic_list']

        titles = []
        urls = []

        for x in json_data:
            titles.append(x['topic_name'])
            urls.append(urllib.parse.unquote(
                x['topic_url'].replace('amp;', '')))

        save_data(titles, urls, SOURCE['tieba'])

# 百度热搜
class baidu_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'http://top.baidu.com/buzz?b=341'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.content.decode('gb2312', errors="ignore"))

        titles = html.xpath(
            "//table[@class='list-table']//tr/td[@class='keyword']/a[@class='list-title']/text()")
        urls = list(map(lambda x: "https://www.baidu.com/s?wd=" + x, titles))

        save_data(titles, urls, SOURCE['baidu'])

# 微博热搜
class weibo_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://s.weibo.com/top/summary/summary'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.text)

        titles = html.xpath("//table/tbody/tr/td[2]/a/text()")
        urls = html.xpath("//table/tbody/tr/td[2]/a/@href")
        urls = list(map(lambda x: "https://s.weibo.com" +
                        urllib.parse.unquote(x).replace("#", "%23"), urls))

        save_data(titles, urls, SOURCE['weibo'])

# 知乎热榜
class zhihu_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&desktop=true'
        response = requests.get(url, headers=HEADERS)

        json_result = response.json()
        json_data = json_result['data']

        titles = []
        urls = []

        for x in json_data:
            titles.append(x['target']['title'])
            urls.append(x['target']['id'])

        urls = list(
            map(lambda x: "https://www.zhihu.com/question/" + str(x), urls))

        save_data(titles, urls, SOURCE['zhihu'])

# 知乎日报
class zhihudaily_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://daily.zhihu.com'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.text)

        titles = html.xpath("//div[@class='box']/a/span/text()")
        urls = html.xpath("//div[@class='box']/a/@href")
        urls = list(map(lambda x: "https://daily.zhihu.com" + x, urls))

        save_data(titles, urls, SOURCE['zhihudaily'])

# 网易新闻
class news163_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'http://news.163.com/special/0001386F/rank_whole.html'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.text)

        titles = html.xpath(
            "//div[@class='area-half left']/div[@class='tabBox']/div[@class='tabContents active']/table//tr/td[1]/a/text()")
        urls = html.xpath(
            "//div[@class='area-half left']/div[@class='tabBox']/div[@class='tabContents active']/table//tr/td[1]/a/@href")

        save_data(titles, urls, SOURCE['163news'])

# GitHub
class github_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://github.com/trending'
        response = requests.get(url, headers=HEADERS)

        html = etree.HTML(response.text)

        urls = html.xpath("//article[@class='Box-row']/h1/a/@href")
        titles = list(map(lambda x: x[1:].replace("/", " / "), urls))

        urls = list(map(lambda x: "https://github.com" + x, urls))

        save_data(titles, urls, SOURCE['github'])

# 抖音热点
class douyin_hot_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/'
        response = requests.get(url, headers=HEADERS)

        json_result = response.json()
        json_data = json_result['word_list']

        titles = []
        urls = []

        for x in json_data:
            titles.append(x['word'])
            urls.append('#' + str(x['hot_value']))

        save_data(titles, urls, SOURCE['douyin_hot'])

# 抖音视频
class douyin_video_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/aweme/'
        response = requests.get(url, headers=HEADERS)

        json_result = response.json()
        json_data = json_result['aweme_list']

        titles = []
        urls = []

        for x in json_data:
            titles.append(x['aweme_info']['desc'])
            urls.append(x['aweme_info']['share_url'])

        save_data(titles, urls, SOURCE['douyin_video'])

# 抖音正能量
class douyin_positive_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        url = 'https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/aweme/?type=positive'
        response = requests.get(url, headers=HEADERS)

        json_result = response.json()
        json_data = json_result['aweme_list']

        titles = []
        urls = []

        for x in json_data:
            titles.append(x['aweme_info']['desc'])
            urls.append(x['aweme_info']['share_url'])

        save_data(titles, urls, SOURCE['douyin_positive'])

def save_data(titles, urls, sourceId):
    hot_news_data = []
    for index, title in enumerate(titles):
        data = {
            "title": title,
            "url": urls[index],
            "sourceId": sourceId
        }
        hot_news_data.append(data)

    HEADERS['spider'] = 'python'
    url = 'https://api.meowv.com/common/hot_news'
    response = requests.post(url, headers=HEADERS, json=hot_news_data)
    if (response.json()['result'] == 'success'):
        print("保存数据完成")

def init():
    cnblogs = cnblogs_spider()
    cnblogs.start()

    v2ex = v2ex_spider()
    v2ex.start()

    segmentfault = segmentfault_spider()
    segmentfault.start()

    juejin = juejin_spider()
    juejin.start()

    weixin = weixin_spider()
    weixin.start()

    douban = douban_spider()
    douban.start()

    ithome = ithome_spider()
    ithome.start()

    kr36 = kr36_spider()
    kr36.start()

    tieba = tieba_spider()
    tieba.start()

    baidu = baidu_spider()
    baidu.start()

    weibo = weibo_spider()
    weibo.start()

    zhihu = zhihu_spider()
    zhihu.start()

    zhihudaily = zhihudaily_spider()
    zhihudaily.start()

    news163 = news163_spider()
    news163.start()

    github = github_spider()
    github.start()

    douyin_hot = douyin_hot_spider()
    douyin_hot.start()

    douyin_video = douyin_video_spider()
    douyin_video.start()

    douyin_positive = douyin_positive_spider()
    douyin_positive.start()

if __name__ == "__main__":
    init()