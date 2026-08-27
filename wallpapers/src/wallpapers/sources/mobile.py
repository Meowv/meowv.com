from __future__ import annotations

from urllib.parse import urlencode

from .base import HttpClient, Page


APP_VERSION = "2.0.0"


def _url(path: str, **params: object) -> str:
    return "https://digbird.shanhutech.cn" + path + "?" + urlencode(params)


class MobileSource:
    def __init__(self, client: HttpClient | None = None) -> None:
        self.client = client or HttpClient()

    def categories(self, content_type: str) -> tuple[list[dict], str, str]:
        content_value = 1 if content_type == "dynamic" else 2
        endpoint = _url("/intf/getCategory", type=content_value, appver=APP_VERSION)
        data, raw = self.client.get_json(endpoint)
        return (data.get("data", []) if isinstance(data, dict) else []), endpoint, raw

    def page(
        self,
        *,
        content_type: str,
        category: str,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 24,
    ) -> Page:
        content_value = 1 if content_type == "dynamic" else 2
        if keyword:
            endpoint = _url(
                "/intf/search", content=keyword, type=content_value, appver=APP_VERSION, pageno=page, count=page_size
            )
        else:
            endpoint = _url(
                "/intf/getCategoryList",
                type=content_value,
                appver=APP_VERSION,
                category=category,
                pageno=page,
                count=page_size,
            )
        payload, raw = self.client.get_json(endpoint)
        data = payload.get("data", {}) if isinstance(payload, dict) else {}
        if keyword and isinstance(data, dict):
            data = data.get("dynamic_list" if content_type == "dynamic" else "static_list", data)
        items = data.get("list", []) if isinstance(data, dict) else []
        total_pages = int(data.get("total_page", 1) or 1) if isinstance(data, dict) else 1
        return Page(items, page, total_pages, endpoint, raw)
