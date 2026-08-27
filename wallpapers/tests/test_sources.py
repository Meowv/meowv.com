import json

from wallpapers.sources.base import HttpClient
from wallpapers.sources.desktop import DesktopSource
from wallpapers.sources.mobile import MobileSource


class FakeClient(HttpClient):
    def __init__(self, payloads):
        self.payloads = iter(payloads)

    def get_json(self, url):
        payload = next(self.payloads)
        return payload, json.dumps(payload, ensure_ascii=False)


def test_desktop_dynamic_page():
    client = FakeClient([{"data": {"total_page": 2, "list": [{"id": "1", "image": "http://x/a.jpg"}]}}])
    page = DesktopSource(client).page(content_type="dynamic", category="风景")
    assert page.total_pages == 2
    assert page.items[0]["id"] == "1"
    assert "categoryList" in page.endpoint


def test_mobile_dynamic_search_page():
    client = FakeClient([{"data": {"dynamic_list": {"total_page": 1, "list": [{"id": "2", "image": "http://x/b.jpg"}]}}}])
    page = MobileSource(client).page(content_type="dynamic", category="风景", keyword="雨夜")
    assert page.items[0]["id"] == "2"
    assert "search" in page.endpoint
