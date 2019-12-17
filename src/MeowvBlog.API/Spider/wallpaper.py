# -*- coding: utf-8 -*-

import requests
import threading
from lxml import etree
from queue import Queue

_list = [
    {'url': 'https://www.i4.cn/wper_4_19_1_1.html', 'type': 1},
    {'url': 'https://www.i4.cn/wper_4_19_58_1.html', 'type': 2},
    {'url': 'https://www.i4.cn/wper_4_19_66_1.html', 'type': 3},
    {'url': 'https://www.i4.cn/wper_4_19_4_1.html', 'type': 4},
    {'url': 'https://www.i4.cn/wper_4_19_3_1.html', 'type': 5},
    {'url': 'https://www.i4.cn/wper_4_19_9_1.html', 'type': 6},
    {'url': 'https://www.i4.cn/wper_4_19_13_1.html', 'type': 7},
    {'url': 'https://www.i4.cn/wper_4_19_64_1.html', 'type': 8},
    {'url': 'https://www.i4.cn/wper_4_19_11_1.html', 'type': 9},
    {'url': 'https://www.i4.cn/wper_4_19_5_1.html', 'type': 10},
    {'url': 'https://www.i4.cn/wper_4_19_34_1.html', 'type': 11},
    {'url': 'https://www.i4.cn/wper_4_19_65_1.html', 'type': 12},
    {'url': 'https://www.i4.cn/wper_4_19_2_1.html', 'type': 13},
    {'url': 'https://www.i4.cn/wper_4_19_10_1.html', 'type': 14},
    {'url': 'https://www.i4.cn/wper_4_19_14_1.html', 'type': 15},
    {'url': 'https://www.i4.cn/wper_4_19_17_1.html', 'type': 16},
    {'url': 'https://www.i4.cn/wper_4_19_15_1.html', 'type': 17},
    {'url': 'https://www.i4.cn/wper_4_19_12_1.html', 'type': 18},
    {'url': 'https://www.i4.cn/wper_4_19_7_1.html', 'type': 19},
    {'url': 'https://www.i4.cn/wper_4_19_63_1.html', 'type': 20}
]

lock = threading.Lock()

HEADERS = {
    'User-Agent': 'Mozilla/5.0'
}

# 美女
class beauty_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[0]['url'], _list[0]['type'])

# 型男
class sportsman_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[1]['url'], _list[1]['type'])

# 萌娃
class cutebaby_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[2]['url'], _list[2]['type'])

# 情感
class emotion_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[3]['url'], _list[3]['type'])

# 风景
class landscape_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[4]['url'], _list[4]['type'])

# 动物
class animal_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[5]['url'], _list[5]['type'])

# 植物
class plant_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[6]['url'], _list[6]['type'])

# 美食
class food_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[7]['url'], _list[7]['type'])

# 影视
class movie_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[8]['url'], _list[8]['type'])

# 动漫
class anime_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[9]['url'], _list[9]['type'])

# 手绘
class handpainted_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[10]['url'], _list[10]['type'])

# 文字
class text_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[11]['url'], _list[11]['type'])

# 创意
class creative_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[12]['url'], _list[12]['type'])

# 名车
class car_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[13]['url'], _list[13]['type'])

# 体育
class physicaleducation_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[14]['url'], _list[14]['type'])

# 军事
class military_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[15]['url'], _list[15]['type'])

# 节日
class festival_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[16]['url'], _list[16]['type'])

# 游戏
class game_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[17]['url'], _list[17]['type'])

# 苹果
class apple_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[18]['url'], _list[18]['type'])

# 其它
class other_spider(threading.Thread):
    def run(self):
        lock.acquire()
        self.spider()
        lock.release()

    def spider(self):
        parse_page(_list[19]['url'], _list[19]['type'])

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
    beauty = beauty_spider()
    beauty.start()

    sportsman = sportsman_spider()
    sportsman.start()

    cutebaby = cutebaby_spider()
    cutebaby.start()

    emotion = emotion_spider()
    emotion.start()

    landscape = landscape_spider()
    landscape.start()

    animal = animal_spider()
    animal.start()

    plant = plant_spider()
    plant.start()

    food = food_spider()
    food.start()

    movie = movie_spider()
    movie.start()

    anime = anime_spider()
    anime.start()

    handpainted = handpainted_spider()
    handpainted.start()

    text = text_spider()
    text.start()

    creative = creative_spider()
    creative.start()

    car = car_spider()
    car.start()

    physicaleducation = physicaleducation_spider()
    physicaleducation.start()

    military = military_spider()
    military.start()

    festival = festival_spider()
    festival.start()

    game = game_spider()
    game.start()

    apple = apple_spider()
    apple.start()

    other = other_spider()
    other.start()


if __name__ == "__main__":
    main()
