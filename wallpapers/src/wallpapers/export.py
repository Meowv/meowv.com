from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1

# 只导出视频预览资源。当前公开接口对「电脑动态」只提供 video_preview，
# 没有 video_original，因此这是唯一可用的播放地址。
VIDEO_ROLE = "video_preview"

# 与 publish.py 一致：每个壁纸最多保留 4 个标签
MAX_TAGS = 4


def _fetch_items(
    source_db: sqlite3.Connection,
    *,
    device: str,
    content: str,
    category: str | None,
) -> tuple[list[dict[str, object]], list[int]]:
    """查询目标壁纸及其视频地址。

    分类过滤同时匹配分类自身的名称与其父分类名称 —— 二级分类
    （例如手机端的「清纯美女」挂在「美女」下）也应能被一级分类名命中。
    """
    rows = source_db.execute(
        f"""
        SELECT w.id, w.title, w.author, w.remote_created_at, w.first_seen_at, a.url
          FROM wallpaper AS w
          JOIN wallpaper_asset AS wa ON wa.wallpaper_id = w.id
          JOIN asset AS a ON a.id = wa.asset_id
         WHERE w.status = 'active'
           AND w.device_type = ?
           AND w.content_type = ?
           AND a.media_role = ?
           AND a.accessible = 1
           AND a.url IS NOT NULL
           AND a.url <> ''
           AND (
                 ? IS NULL
                 OR EXISTS (
                      SELECT 1
                        FROM wallpaper_category AS wc
                        JOIN category AS c ON c.id = wc.category_id
                        LEFT JOIN category AS parent ON parent.id = c.parent_id
                       WHERE wc.wallpaper_id = w.id
                         AND (c.name = ? OR parent.name = ?)
                    )
               )
         ORDER BY COALESCE(w.remote_created_at, w.first_seen_at) DESC,
                  w.id DESC,
                  COALESCE(wa.is_primary, 0) DESC,
                  COALESCE(wa.sort_order, 999999) ASC,
                  a.id ASC
        """,
        (device, content, VIDEO_ROLE, category, category, category),
    ).fetchall()

    tags = _fetch_tags(source_db)
    category_ids = _fetch_category_ids(source_db, category, device, content)

    items: list[dict[str, object]] = []
    seen: set[int] = set()
    for row in rows:
        wallpaper_id = int(row[0])
        # 同一壁纸可能有多个 video_preview 资源，按 ORDER BY 取第一个即可
        if wallpaper_id in seen:
            continue
        seen.add(wallpaper_id)
        items.append(
            {
                "id": wallpaper_id,
                "title": row[1] or "",
                "author": row[2] or "",
                "url": str(row[5]),
                # 数据库里的 asset.duration_seconds 当前全为 NULL，客户端在播放时用
                # AVAsset 自行探测，不在这里伪造默认值
                "durationSeconds": None,
                "tags": tags.get(wallpaper_id, []),
            }
        )
    return items, category_ids


def _fetch_tags(source_db: sqlite3.Connection) -> dict[int, list[str]]:
    columns = {str(row[1]) for row in source_db.execute("PRAGMA table_info(wallpaper_keyword)")}
    # 注意：不能把缺失的 match_rank 替换成字面量 999999 —— SQLite 会把 ORDER BY 里的
    # 常量整数当成「第 N 列」的位置引用，值超范围会直接报 OperationalError。
    # 旧版数据库可能没有 match_rank 列，这里按列是否存在拼装整段 ORDER BY。
    order_by = (
        "wk.wallpaper_id, COALESCE(wk.match_rank, 999999), k.id"
        if "match_rank" in columns
        else "wk.wallpaper_id, k.id"
    )
    tags: dict[int, list[str]] = {}
    for wallpaper_id, keyword in source_db.execute(
        f"""
        SELECT wk.wallpaper_id, k.keyword
          FROM wallpaper_keyword AS wk
          JOIN keyword AS k ON k.id = wk.keyword_id
         WHERE k.keyword_type = 'tag'
         ORDER BY {order_by}
        """
    ):
        values = tags.setdefault(int(wallpaper_id), [])
        value = str(keyword or "").strip()
        if value and value not in values and len(values) < MAX_TAGS:
            values.append(value)
    return tags


def _fetch_category_ids(
    source_db: sqlite3.Connection,
    category: str | None,
    device: str,
    content: str,
) -> list[int]:
    """记录本次导出实际覆盖到的分类 ID，便于客户端与排查时定位数据范围。"""
    if category is None:
        rows = source_db.execute(
            "SELECT id FROM category WHERE device_type = ? AND content_type = ? ORDER BY level, sort_order, id",
            (device, content),
        ).fetchall()
        return [int(row[0]) for row in rows]

    rows = source_db.execute(
        """
        SELECT c.id
          FROM category AS c
          LEFT JOIN category AS parent ON parent.id = c.parent_id
         WHERE c.device_type = ?
           AND c.content_type = ?
           AND (c.name = ? OR parent.name = ?)
         ORDER BY c.level, c.sort_order, c.id
        """,
        (device, content, category, category),
    ).fetchall()
    return [int(row[0]) for row in rows]


def export_livewall_catalog(
    source: str | Path,
    output: str | Path,
    *,
    device: str = "desktop",
    content: str = "dynamic",
    category: str | None = None,
) -> tuple[Path, int]:
    """导出供「动态壁纸」客户端使用的壁纸清单。

    与 `publish_catalog` 的区别：这里**不做加密**，输出是明文 JSON，
    直接给本机客户端读取。返回 (输出路径, 条目数)。
    """
    source_path = Path(source).resolve()
    output_path = Path(output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(f"file:{source_path}?mode=ro", uri=True) as source_db:
        items, category_ids = _fetch_items(
            source_db, device=device, content=content, category=category
        )

    catalog = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "deviceType": device,
            "contentType": content,
            "categoryName": category,
            "categoryIds": category_ids,
        },
        "items": items,
    }
    output_path.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return output_path, len(items)
