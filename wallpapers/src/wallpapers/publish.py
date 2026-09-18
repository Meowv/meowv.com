from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


JSON_WALLPAPER_FIELDS = (
    "id",
    "title",
    "author",
    "device_type",
    "content_type",
    "width",
    "height",
    "duration_seconds",
    "remote_created_at",
    "first_seen_at",
)

CATALOG_BUCKETS = (
    ("desktop", "dynamic"),
    ("desktop", "static"),
    ("mobile", "dynamic"),
    ("mobile", "static"),
)


def catalog_bucket(device: str, content: str) -> str:
    return f"{device}:{content}"


def _build_json_catalog(
    source_db: sqlite3.Connection, target_dir: Path, stamp: str
) -> tuple[dict[str, Path], Path]:
    rows = source_db.execute(
        "SELECT " + ", ".join(JSON_WALLPAPER_FIELDS) + " FROM wallpaper WHERE status = 'active'"
    ).fetchall()
    columns = [description[0] for description in source_db.execute(
        "SELECT " + ", ".join(JSON_WALLPAPER_FIELDS) + " FROM wallpaper LIMIT 0"
    ).description]
    by_id = {
        int(row[0]): dict(zip(columns, row))
        for row in rows
    }

    assets: dict[int, dict[str, str]] = {}
    for wallpaper_id, url, media_role, is_primary, sort_order, asset_id in source_db.execute(
        """
        SELECT wa.wallpaper_id, a.url, a.media_role, wa.is_primary, wa.sort_order, a.id
          FROM wallpaper_asset wa
          JOIN asset a ON a.id = wa.asset_id
         WHERE a.accessible = 1 AND a.media_role IN ('image', 'video_preview')
         ORDER BY wa.wallpaper_id, wa.is_primary DESC, wa.sort_order, a.id
        """
    ):
        current = assets.setdefault(int(wallpaper_id), {})
        role = str(media_role)
        if role not in current and url:
            current[role] = str(url)

    category_rows = source_db.execute(
        """
        SELECT id, name, level, parent_id, device_type, content_type, sort_order
          FROM category
         ORDER BY device_type, content_type, level, sort_order, id
        """
    ).fetchall()
    categories = [
        {
            "id": int(row[0]),
            "name": row[1],
            "level": int(row[2]),
            "parentId": int(row[3]) if row[3] is not None else None,
            "deviceType": row[4],
            "contentType": row[5],
            "sortOrder": int(row[6] or 0),
        }
        for row in category_rows
    ]

    keyword_columns = {
        row[1] for row in source_db.execute("PRAGMA table_info(wallpaper_keyword)")
    }
    # 注意：不能把缺失的 match_rank 替换成字面量 999999 —— SQLite 会把 ORDER BY 里的
    # 常量整数当成「第 N 列」的位置引用，值超出结果集列数会直接抛
    # OperationalError: 2nd ORDER BY term out of range。
    # 旧版数据库可能没有 match_rank 列，因此按列是否存在拼装整段 ORDER BY。
    order_by = (
        "wk.wallpaper_id, COALESCE(wk.match_rank, 999999), k.id"
        if "match_rank" in keyword_columns
        else "wk.wallpaper_id, k.id"
    )
    tags: dict[int, list[str]] = {}
    for wallpaper_id, keyword in source_db.execute(
        f"""
        SELECT wk.wallpaper_id, k.keyword
          FROM wallpaper_keyword wk
          JOIN keyword k ON k.id = wk.keyword_id
         WHERE k.keyword_type = 'tag'
         ORDER BY {order_by}
        """
    ):
        values = tags.setdefault(int(wallpaper_id), [])
        value = str(keyword or "").strip()
        if value and value not in values and len(values) < 4:
            values.append(value)

    items = []
    for wallpaper_id, row in by_id.items():
        media = assets.get(wallpaper_id, {})
        items.append(
            {
                "id": wallpaper_id,
                "title": row["title"],
                "author": row["author"],
                "deviceType": row["device_type"],
                "contentType": row["content_type"],
                "width": row["width"],
                "height": row["height"],
                "durationSeconds": row["duration_seconds"],
                "remoteCreatedAt": row["remote_created_at"] or row["first_seen_at"],
                "coverUrl": media.get("image"),
                "previewVideoUrl": media.get("video_preview"),
                "tags": tags.get(wallpaper_id, []),
                "categoryIds": [],
            }
        )

    items_by_id = {item["id"]: item for item in items}
    for wallpaper_id, category_id in source_db.execute(
        "SELECT wallpaper_id, category_id FROM wallpaper_category"
    ):
        item = items_by_id.get(int(wallpaper_id))
        if item is not None:
            item["categoryIds"].append(int(category_id))

    items.sort(key=lambda item: (str(item["remoteCreatedAt"] or ""), int(item["id"])), reverse=True)
    items.sort(key=lambda item: 0 if item["contentType"] == "dynamic" else 1)
    generated_at = datetime.now(timezone.utc).isoformat()
    catalog_paths: dict[str, Path] = {}
    for device, content in CATALOG_BUCKETS:
        bucket = catalog_bucket(device, content)
        catalog_name = f"wallpapers.catalog.{device}.{content}.{stamp}.json"
        catalog_path = target_dir / catalog_name
        bucket_items = [
            item
            for item in items
            if item["deviceType"] == device and item["contentType"] == content
        ]
        catalog_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 2,
                    "generatedAt": generated_at,
                    "deviceType": device,
                    "contentType": content,
                    "categories": categories,
                    "items": bucket_items,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        catalog_paths[bucket] = catalog_path

    bootstrap_name = f"wallpapers.catalog.bootstrap.{stamp}.json"
    bootstrap_path = target_dir / bootstrap_name
    bootstrap_items = [
        item
        for item in items
        if item["deviceType"] == "desktop"
    ][:20]
    bootstrap_path.write_text(
        json.dumps(
            {
                "schemaVersion": 2,
                "generatedAt": generated_at,
                "categories": categories,
                "items": bootstrap_items,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    for previous in target_dir.glob("wallpapers.catalog.*.json"):
        if previous not in (*catalog_paths.values(), bootstrap_path, target_dir / "wallpapers.catalog.json"):
            previous.unlink(missing_ok=True)
    for previous in target_dir.glob("wallpapers.catalog.*.db"):
        previous.unlink(missing_ok=True)
    return catalog_paths, bootstrap_path


def publish_catalog(source: str | Path, output_dir: str | Path) -> tuple[dict[str, Path], Path]:
    source_path = Path(source).resolve()
    target_dir = Path(output_dir).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    with sqlite3.connect(f"file:{source_path}?mode=ro", uri=True) as source_db:
        catalog_paths, bootstrap_path = _build_json_catalog(source_db, target_dir, stamp)

    manifest_path = target_dir / "wallpapers.catalog.json"
    manifest = {
        "schemaVersion": 2,
        "catalogs": {
            bucket: {"file": path.name, "fileSize": path.stat().st_size}
            for bucket, path in catalog_paths.items()
        },
        "bootstrap": bootstrap_path.name,
        "bootstrapFileSize": bootstrap_path.stat().st_size,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return catalog_paths, manifest_path
