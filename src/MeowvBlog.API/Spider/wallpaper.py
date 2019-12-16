# -*- coding: utf-8 -*-

import requests
import threading
from lxml import etree
from queue import Queue

Type = {
    "Recommend": 1,
    "Latest": 2,
    "WeeklyRanking": 3,
    "MonthlyRanking": 4,
    "TotalRanking": 5,
    "Beauty": 6,
    "Sportsman": 7,
    "CuteBaby": 8,
    "Emotion": 9,
    "Landscape ": 10,
    "Animal": 11,
    "Plant": 12,
    "Food": 13,
    "Movie": 14,
    "Anime": 15,
    "HandPainted": 16,
    "Text": 17,
    "Creative": 18,
    "Car": 19,
    "PhysicalEducation": 21,
    "Military": 21,
    "Festival": 22,
    "Game": 23,
    "Apple": 24,
    "Other": 25
}

lock = threading.Lock()

HEADERS = {
    'User-Agent': 'Mozilla/5.0'
}

# 推荐
class recommend_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_1_0_0_1.html', Type['Recommend'])

# 最新
class latest_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_3_0_0_1.html', Type['Latest'])

# 周排行
class weeklyranking_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_21_0_0_1.html', Type['WeeklyRanking'])

# 月排行
class monthlyranking_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_22_0_0_1.html', Type['MonthlyRanking'])

# 总排行
class totalranking_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_23_0_0_1.html', Type['TotalRanking'])

# 美女
class beauty_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_1_1.html', Type['Beauty'])

# 型男
class sportsman_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_58_1.html', Type['Sportsman'])

# 萌娃
class cutebaby_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_66_1.html', Type['CuteBaby'])

# 情感
class emotion_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_4_1.html', Type['Emotion'])

# 风景
class landscape_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_3_1.html', Type['Landscape'])

# 动物
class animal_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_9_1.html', Type['Animal'])

# 植物
class plant_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_13_1.html', Type['Plant'])

# 美食
class food_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_64_1.html', Type['Food'])

# 影视
class movie_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_11_1.html', Type['Movie'])

# 动漫
class anime_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_5_1.html', Type['Anime'])

# 手绘
class handpainted_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_34_1.html', Type['HandPainted'])

# 文字
class text_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_65_1.html', Type['Text'])

# 创意
class creative_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_2_1.html', Type['Creative'])

# 名车
class car_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_10_1.html', Type['Car'])

# 体育
class physicaleducation_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_14_1.html', Type['PhysicalEducation'])

# 军事
class military_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_17_1.html', Type['Military'])

# 节日
class festival_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_15_1.html', Type['Festival'])

# 游戏
class game_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_12_1.html', Type['Game'])

# 苹果
class apple_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_7_1.html', Type['Apple'])

# 其它
class other_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page('https://www.i4.cn/wper_4_0_63_1.html', Type['Other'])


def parse_page(url, _type):
    response = requests.get(url, headers=HEADERS)
    html = etree.HTML(response.text)

    urls = html.xpath(
        "//article[@id='wper']/div[@class='jbox']/div[@class='kbox']/div/a/img[1]/@src")
    urls = list(map(lambda x: x.replace('middle', 'max'), urls))
    titles = html.xpath(
        "//article[@id='wper']/div[@class='jbox']/div[@class='kbox']/div/a/img[1]/@alt")
    save_data(urls, titles, _type)


def save_data(urls, titles, _type):
    data = {
        "type": _type,
        "wallpapers": []
    }
    for index, url in enumerate(urls):
        item = {
            "url": url,
            "title": titles[index],
        }
        data['wallpapers'].append(item)

    HEADERS['spider'] = 'python'
    url = 'https://api.meowv.com/wallpaper'
    response = requests.post(url, headers=HEADERS, json=data)


def main():
    pass


if __name__ == "__main__":
    main()
