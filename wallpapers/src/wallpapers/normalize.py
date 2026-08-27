from __future__ import annotations

import hashlib
import json
import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from .models import AssetData, CategoryData, WallpaperData


def normalize_url(value: Any) -> str:
    if not value:
        return ""
    value = str(value).strip()
    if value.startswith("http://"):
        value = "https://" + value[7:]
    parts = urlsplit(value)
    if not parts.scheme or not parts.netloc:
        return value
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query, ""))


def parse_dimensions(value: Any) -> tuple[int | None, int | None]:
    match = re.search(r"(\d+)\s*[xX×]\s*(\d+)", str(value or ""))
    return (int(match.group(1)), int(match.group(2))) if match else (None, None)


def split_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        values = value
    else:
        values = re.split(r"[,，、\s]+", str(value or ""))
    return [str(item).strip() for item in values if str(item).strip()]


def _number(value: Any) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _asset(value: Any, media_type: str, role: str) -> AssetData | None:
    url = normalize_url(value)
    return AssetData(url=url, media_type=media_type, media_role=role) if url else None


def normalize_item(
    raw: dict[str, Any], *, device_type: str, content_type: str, source: str
) -> WallpaperData | None:
    image_url = normalize_url(raw.get("image") or raw.get("url"))
    if not image_url:
        return None

    remote_id = str(raw.get("id") or "").strip() or None
    identity = remote_id or hashlib.sha256(image_url.encode("utf-8")).hexdigest()
    stable_key = f"{device_type}-{content_type}-{identity}"
    width, height = parse_dimensions(raw.get("video_size") or raw.get("resolution"))
    if width is None and height is None:
        width, height = parse_dimensions(raw.get("size"))

    assets: list[AssetData] = []
    image = _asset(image_url, "image", "image")
    if image:
        assets.append(image)
    video_value = raw.get("file_url_10s") or raw.get("url_preview") or raw.get("video_url")
    video = _asset(video_value, "video", "video_preview")
    if video:
        assets.append(video)

    categories: list[CategoryData] = []
    primary = str(raw.get("first_category") or raw.get("category") or "").strip()
    secondary = str(raw.get("second_category") or "").strip()
    if primary:
        categories.append(CategoryData(primary, 1))
    if secondary:
        categories.append(CategoryData(secondary, 2, primary or None))

    keywords = [(tag, "tag") for tag in split_tags(raw.get("tags") or raw.get("tag"))]
    return WallpaperData(
        stable_key=stable_key,
        source=source,
        device_type=device_type,
        content_type=content_type,
        remote_id=remote_id,
        remote_qid=str(raw.get("qid") or "").strip() or None,
        title=str(raw.get("title") or primary or "Wallpaper").strip(),
        author=str(raw.get("author") or "").strip(),
        fee_type=str(raw.get("fee_type") or "").strip(),
        price=_number(raw.get("price") or raw.get("activity_price") or raw.get("rate_price")),
        resolution_raw=str(raw.get("video_size") or raw.get("resolution") or "").strip(),
        width=width,
        height=height,
        duration_seconds=_number(raw.get("duration")),
        remote_created_at=str(raw.get("create_time") or "").strip() or None,
        categories=categories,
        keywords=keywords,
        assets=assets,
        raw_json=json.dumps(raw, ensure_ascii=False, sort_keys=True),
    )
