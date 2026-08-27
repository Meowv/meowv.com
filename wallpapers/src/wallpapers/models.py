from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class CategoryData:
    name: str
    level: int = 1
    parent_name: str | None = None
    remote_key: str | None = None
    sort_order: int = 0


@dataclass(frozen=True)
class AssetData:
    url: str
    media_type: str
    media_role: str
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    file_size: int | None = None
    mime_type: str | None = None


@dataclass
class WallpaperData:
    stable_key: str
    source: str
    device_type: str
    content_type: str
    remote_id: str | None = None
    remote_qid: str | None = None
    title: str = "Wallpaper"
    author: str = ""
    fee_type: str = ""
    price: float | None = None
    currency: str | None = None
    resolution_raw: str = ""
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    remote_created_at: str | None = None
    categories: list[CategoryData] = field(default_factory=list)
    keywords: list[tuple[str, str]] = field(default_factory=list)
    assets: list[AssetData] = field(default_factory=list)
    raw_json: str = ""
