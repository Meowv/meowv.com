from __future__ import annotations

from urllib.parse import quote

from .base import HttpClient, SourceError


class ManifestSource:
    def __init__(self, client: HttpClient | None = None) -> None:
        self.client = client or HttpClient()

    def wallpapers(self) -> tuple[list[str], str, str]:
        endpoint = "https://ios.25pan.com/wallpaper/list.json"
        payload, raw = self.client.get_json(endpoint)
        if not isinstance(payload, dict) or not isinstance(payload.get("wallpapers"), list):
            raise SourceError("wallpaper manifest 格式错误")
        return [f"https://ios.25pan.com{quote(str(path), safe='/')}" for path in payload["wallpapers"]], endpoint, raw

    def videos(self) -> tuple[list[str], str, str]:
        endpoint = "https://ios.25pan.com/wallpaper/videos.json"
        payload, raw = self.client.get_json(endpoint)
        if not isinstance(payload, list):
            raise SourceError("videos manifest 不是 JSON 数组")
        return [str(item) for item in payload if item], endpoint, raw
