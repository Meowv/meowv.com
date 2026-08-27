from wallpapers.db import Database
from wallpapers.pipeline import Crawler
from wallpapers.sources.base import HttpClient
from urllib.parse import parse_qs, urlsplit


class FakeClient(HttpClient):
    def __init__(self):
        self.calls = []

    def get_json(self, url):
        self.calls.append(url)
        if "getCategory" in url and "categoryList" not in url:
            return {"data": [{"category": "风景"}]}, '{"data":[{"category":"风景"}]}'
        return {
            "data": {
                "total_page": 1,
                "list": [{"id": "1", "image": "http://cdn.example/a.jpg", "title": "测试", "first_category": "风景"}],
            }
        }, '{"data":{"total_page":1,"list":[{"id":"1","image":"http://cdn.example/a.jpg"}]}}'


def test_pipeline_smoke(tmp_path):
    with Database(tmp_path / "crawl.db") as db:
        summary = Crawler(db, client=FakeClient()).crawl(
            devices=("desktop",), contents=("dynamic",), categories=("风景",), page_size=1
        )
        assert summary.items == 1
        assert db.conn.execute("SELECT COUNT(*) FROM crawl_request").fetchone()[0] == 2


class PagedClient(HttpClient):
    def __init__(self):
        self.page_calls = []

    def get_json(self, url):
        if "getCategory" in url and "categoryList" not in url:
            return {"data": [{"category": "风景"}]}, '{"data":[{"category":"风景"}]}'
        page = int(parse_qs(urlsplit(url).query).get("pageno", ["1"])[0])
        self.page_calls.append(page)
        item_id = str(page)
        payload = {
            "data": {
                "total_page": 2,
                "list": [
                    {
                        "id": item_id,
                        "image": f"http://cdn.example/{item_id}.jpg",
                        "title": f"测试 {item_id}",
                        "first_category": "风景",
                        "create_time": f"2026-08-{28 - page:02d} 00:00:00",
                    }
                ],
            }
        }
        return payload, "{}"


def test_incremental_stops_at_known_first_page(tmp_path):
    client = PagedClient()
    with Database(tmp_path / "incremental.db") as db:
        crawler = Crawler(db, client=client)
        crawler.crawl(
            devices=("desktop",), contents=("dynamic",), categories=("风景",), page_size=1, mode="full"
        )
        assert client.page_calls == [1, 2]

        client.page_calls.clear()
        crawler.crawl(
            devices=("desktop",), contents=("dynamic",), categories=("风景",), page_size=1, mode="incremental"
        )
        assert client.page_calls == [1]


def test_quick_mode_does_not_advance_cursor(tmp_path):
    client = PagedClient()
    with Database(tmp_path / "quick.db") as db:
        Crawler(db, client=client).crawl(
            devices=("desktop",), contents=("dynamic",), categories=("风景",), page_size=1, mode="quick"
        )
        assert client.page_calls == [1]
        assert db.conn.execute("SELECT COUNT(*) FROM crawl_cursor").fetchone()[0] == 0
