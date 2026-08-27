from __future__ import annotations

from dataclasses import dataclass


USER_AGENT = "wallpapers-crawler/0.1 (+public-api; contact=local)"
DEFAULT_PAGE_SIZE = 24
DEFAULT_TIMEOUT = 20.0
DEFAULT_RETRIES = 3
DEFAULT_RATE_LIMIT = 0.5


@dataclass(frozen=True)
class SourceConfig:
    source: str
    device_type: str
    content_type: str
    base_url: str


SOURCES = {
    ("desktop", "dynamic"): SourceConfig(
        "shanhutech-desktop-dynamic", "desktop", "dynamic", "https://bizhi.shanhutech.cn"
    ),
    ("desktop", "static"): SourceConfig(
        "shanhutech-desktop-static", "desktop", "static", "https://wp.shanhutech.cn"
    ),
    ("mobile", "dynamic"): SourceConfig(
        "shanhutech-mobile", "mobile", "dynamic", "https://digbird.shanhutech.cn"
    ),
    ("mobile", "static"): SourceConfig(
        "shanhutech-mobile", "mobile", "static", "https://digbird.shanhutech.cn"
    ),
}
