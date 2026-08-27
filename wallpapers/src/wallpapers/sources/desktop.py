from __future__ import annotations

from urllib.parse import urlencode

from .base import HttpClient, Page


def _url(base: str, path: str, **params: object) -> str:
    return f"{base}{path}?{urlencode({k: v for k, v in params.items() if v is not None})}"


class DesktopSource:
    def __init__(self, client: HttpClient | None = None) -> None:
        self.client = client or HttpClient()

    def categories(self, content_type: str) -> tuple[list[dict], str, str]:
        if content_type == "dynamic":
            endpoint = "https://bizhi.shanhutech.cn/live/intf/getCategory"
        else:
            endpoint = "https://wp.shanhutech.cn/intf/getCategory"
        data, raw = self.client.get_json(endpoint)
        return (data.get("data", []) if isinstance(data, dict) else []), endpoint, raw

    def page(
        self,
        *,
        content_type: str,
        category: str | None = None,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 24,
    ) -> Page:
        if content_type == "dynamic":
            base = "https://bizhi.shanhutech.cn"
            if keyword:
                endpoint = _url(base, "/live/wallpaper/searchList", keyword=keyword, pageno=page, count=page_size)
            else:
                endpoint = _url(base, "/live/wallpaper/categoryList", category=category or "双屏", pageno=page, count=page_size, type=1)
        else:
            base = "https://wp.shanhutech.cn"
            if keyword:
                endpoint = _url(base, "/intf/search", content=keyword, pageno=page, count=page_size)
            elif category:
                endpoint = _url(base, "/intf/GetListByCategory", cids=category, pageno=page, count=page_size)
            else:
                endpoint = _url(base, "/intf/newestList", pageno=page, count=page_size)
        payload, raw = self.client.get_json(endpoint)
        data = payload.get("data", {}) if isinstance(payload, dict) else {}
        if content_type == "dynamic" and keyword:
            data = data if isinstance(data, dict) else {}
        items = data.get("list", []) if isinstance(data, dict) else []
        total_pages = int(data.get("total_page", 1) or 1) if isinstance(data, dict) else 1
        return Page(items, page, total_pages, endpoint, raw)
