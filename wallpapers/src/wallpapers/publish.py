from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path


PUBLISHED_TABLES = (
    "wallpaper",
    "asset",
    "wallpaper_asset",
    "category",
    "wallpaper_category",
    "keyword",
    "wallpaper_keyword",
)

PUBLISHED_INDEXES = (
    "idx_wallpaper_listing",
    "idx_category_nav",
    "idx_wallpaper_category_reverse",
    "idx_wallpaper_keyword_reverse",
    "idx_asset_role",
)

WALLPAPER_COLUMNS = (
    "id",
    "source",
    "remote_id",
    "remote_qid",
    "stable_key",
    "device_type",
    "content_type",
    "title",
    "author",
    "fee_type",
    "price",
    "resolution_raw",
    "width",
    "height",
    "duration_seconds",
    "remote_created_at",
    "first_seen_at",
    "last_seen_at",
    "updated_at",
    "status",
)

WALLPAPER_SCHEMA = """
CREATE TABLE wallpaper (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    remote_id TEXT,
    remote_qid TEXT,
    stable_key TEXT NOT NULL UNIQUE,
    device_type TEXT NOT NULL CHECK (device_type IN ('desktop','mobile')),
    content_type TEXT NOT NULL CHECK (content_type IN ('static','dynamic')),
    title TEXT, author TEXT, fee_type TEXT, price NUMERIC,
    resolution_raw TEXT, width INTEGER, height INTEGER, duration_seconds REAL,
    remote_created_at TEXT, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','missing','inactive'))
)
"""


def publish_catalog(source: str | Path, output_dir: str | Path) -> tuple[Path, Path]:
    source_path = Path(source).resolve()
    target_dir = Path(output_dir).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    database_name = f"wallpapers.catalog.{stamp}.db"
    final_path = target_dir / database_name

    fd, temporary_name = tempfile.mkstemp(prefix="wallpapers.catalog.", suffix=".db", dir=target_dir)
    os.close(fd)
    temporary_path = Path(temporary_name)
    try:
        with sqlite3.connect(f"file:{source_path}?mode=ro", uri=True) as source_db:
            with sqlite3.connect(temporary_path) as target_db:
                target_db.execute("ATTACH DATABASE ? AS src", (str(source_path),))
                target_db.execute("PRAGMA foreign_keys = ON")
                target_db.execute("PRAGMA journal_mode = DELETE")
                target_db.execute("BEGIN")
                try:
                    for table in PUBLISHED_TABLES:
                        if table == "wallpaper":
                            target_db.execute(WALLPAPER_SCHEMA)
                            columns = ", ".join(WALLPAPER_COLUMNS)
                            target_db.execute(
                                f"INSERT INTO wallpaper ({columns}) SELECT {columns} FROM src.wallpaper"
                            )
                            continue
                        schema = source_db.execute(
                            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
                        ).fetchone()
                        if not schema or not schema[0]:
                            raise RuntimeError(f"源数据库缺少表：{table}")
                        target_db.execute(schema[0])
                        target_db.execute(f"INSERT INTO {table} SELECT * FROM src.{table}")

                    for index_name in PUBLISHED_INDEXES:
                        schema = source_db.execute(
                            "SELECT sql FROM sqlite_master WHERE type='index' AND name=?",
                            (index_name,),
                        ).fetchone()
                        if schema and schema[0]:
                            target_db.execute(schema[0])

                    target_db.execute(
                        "CREATE INDEX IF NOT EXISTS idx_wallpaper_listing "
                        "ON wallpaper(device_type, content_type, status, remote_created_at DESC, id DESC)"
                    )
                    target_db.execute(
                        "CREATE INDEX IF NOT EXISTS idx_category_nav "
                        "ON category(device_type, content_type, level, parent_id, sort_order, id)"
                    )
                    target_db.execute(
                        "CREATE INDEX IF NOT EXISTS idx_wallpaper_category_reverse "
                        "ON wallpaper_category(category_id, wallpaper_id)"
                    )
                    target_db.execute(
                        "CREATE INDEX IF NOT EXISTS idx_wallpaper_keyword_reverse "
                        "ON wallpaper_keyword(keyword_id, wallpaper_id)"
                    )
                    target_db.execute(
                        "CREATE INDEX IF NOT EXISTS idx_asset_role "
                        "ON asset(media_role, accessible)"
                    )
                    target_db.commit()
                except Exception:
                    target_db.rollback()
                    raise

                target_db.execute("VACUUM")

        os.replace(temporary_path, final_path)
        final_path.chmod(0o644)
        for previous in target_dir.glob("wallpapers.catalog.*.db"):
            if previous != final_path:
                previous.unlink(missing_ok=True)
        size = final_path.stat().st_size
        manifest_path = target_dir / "wallpapers.catalog.json"
        manifest = {
            "schemaVersion": 1,
            "database": database_name,
            "fileSize": size,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return final_path, manifest_path
    finally:
        temporary_path.unlink(missing_ok=True)
