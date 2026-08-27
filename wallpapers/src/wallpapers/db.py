from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .models import CategoryData, WallpaperData
from .normalize import normalize_url


SCHEMA = """
CREATE TABLE IF NOT EXISTS wallpaper (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'shanhutech',
    remote_id TEXT,
    remote_qid TEXT,
    stable_key TEXT NOT NULL UNIQUE,
    device_type TEXT NOT NULL CHECK (device_type IN ('desktop','mobile')),
    content_type TEXT NOT NULL CHECK (content_type IN ('static','dynamic')),
    title TEXT, author TEXT, fee_type TEXT, price NUMERIC,
    resolution_raw TEXT, width INTEGER, height INTEGER, duration_seconds REAL,
    remote_created_at TEXT, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, raw_json TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','missing','inactive')),
    last_seen_run_id INTEGER,
    missing_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_wallpaper_type ON wallpaper(device_type, content_type);
CREATE TABLE IF NOT EXISTS asset (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE, normalized_url TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image','video','other')),
    media_role TEXT NOT NULL CHECK (media_role IN ('thumbnail','cover','image','video_preview','video_original','other')),
    width INTEGER, height INTEGER, duration_seconds REAL, file_size INTEGER,
    mime_type TEXT, http_status INTEGER, accessible INTEGER NOT NULL DEFAULT 1 CHECK (accessible IN (0,1)),
    first_checked_at TEXT NOT NULL, last_checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset_type_role ON asset(media_type, media_role);
CREATE TABLE IF NOT EXISTS wallpaper_asset (
    wallpaper_id INTEGER NOT NULL, asset_id INTEGER NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (wallpaper_id, asset_id),
    FOREIGN KEY (wallpaper_id) REFERENCES wallpaper(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES asset(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'shanhutech', device_type TEXT NOT NULL,
    content_type TEXT NOT NULL, remote_key TEXT, name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1 CHECK (level IN (1,2)), parent_id INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(source, device_type, content_type, remote_key, name),
    FOREIGN KEY (parent_id) REFERENCES category(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS wallpaper_category (
    wallpaper_id INTEGER NOT NULL, category_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL DEFAULT 'primary' CHECK (relation_type IN ('primary','secondary')),
    PRIMARY KEY (wallpaper_id, category_id),
    FOREIGN KEY (wallpaper_id) REFERENCES wallpaper(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS keyword (
    id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL,
    keyword_type TEXT NOT NULL CHECK (keyword_type IN ('query','tag')),
    UNIQUE(keyword, keyword_type)
);
CREATE TABLE IF NOT EXISTS wallpaper_keyword (
    wallpaper_id INTEGER NOT NULL, keyword_id INTEGER NOT NULL,
    matched_at TEXT, match_rank INTEGER,
    PRIMARY KEY (wallpaper_id, keyword_id),
    FOREIGN KEY (wallpaper_id) REFERENCES wallpaper(id) ON DELETE CASCADE,
    FOREIGN KEY (keyword_id) REFERENCES keyword(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS crawl_run (
    id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
    mode TEXT NOT NULL DEFAULT 'incremental' CHECK (mode IN ('quick','incremental','full')),
    total_requests INTEGER NOT NULL DEFAULT 0, total_items INTEGER NOT NULL DEFAULT 0,
    total_assets INTEGER NOT NULL DEFAULT 0, error_message TEXT
);
CREATE TABLE IF NOT EXISTS crawl_request (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('manifest','newest','category','search','fallback')),
    endpoint TEXT NOT NULL, device_type TEXT, content_type TEXT, category_id INTEGER,
    search_keyword TEXT, page INTEGER, page_size INTEGER, http_status INTEGER,
    requested_at TEXT NOT NULL, response_hash TEXT, response_json TEXT, error_message TEXT,
    FOREIGN KEY (run_id) REFERENCES crawl_run(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_crawl_request_run ON crawl_request(run_id);
CREATE TABLE IF NOT EXISTS wallpaper_discovery (
    request_id INTEGER NOT NULL, wallpaper_id INTEGER NOT NULL,
    result_rank INTEGER, discovered_at TEXT NOT NULL,
    PRIMARY KEY (request_id, wallpaper_id),
    FOREIGN KEY (request_id) REFERENCES crawl_request(id) ON DELETE CASCADE,
    FOREIGN KEY (wallpaper_id) REFERENCES wallpaper(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS crawl_cursor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    device_type TEXT NOT NULL CHECK (device_type IN ('desktop','mobile')),
    content_type TEXT NOT NULL CHECK (content_type IN ('static','dynamic')),
    scope_type TEXT NOT NULL CHECK (scope_type IN ('newest','category','search')),
    scope_key TEXT NOT NULL,
    last_remote_created_at TEXT,
    last_remote_id TEXT,
    last_page_hash TEXT,
    last_success_at TEXT NOT NULL,
    UNIQUE(source, device_type, content_type, scope_type, scope_key)
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(SCHEMA)
        self._migrate_schema()
        self.conn.commit()

    def _migrate_schema(self) -> None:
        self._ensure_column(
            "wallpaper",
            "status",
            "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','missing','inactive'))",
        )
        self._ensure_column("wallpaper", "last_seen_run_id", "INTEGER")
        self._ensure_column("wallpaper", "missing_count", "INTEGER NOT NULL DEFAULT 0")
        self._ensure_column(
            "crawl_run",
            "mode",
            "TEXT NOT NULL DEFAULT 'incremental' CHECK (mode IN ('quick','incremental','full'))",
        )
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_wallpaper_status ON wallpaper(status)")

    def _ensure_column(self, table: str, column: str, definition: str) -> None:
        columns = {str(row[1]) for row in self.conn.execute(f"PRAGMA table_info({table})")}
        if column not in columns:
            self.conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def begin_run(self, mode: str = "incremental") -> int:
        cursor = self.conn.execute("INSERT INTO crawl_run(started_at, mode) VALUES (?, ?)", (now(), mode))
        self.conn.commit()
        return int(cursor.lastrowid)

    def finish_run(
        self,
        run_id: int,
        status: str,
        error_message: str | None = None,
        *,
        total_requests: int | None = None,
        total_items: int | None = None,
        total_assets: int | None = None,
    ) -> None:
        if total_assets is None:
            total_assets = int(self.conn.execute("SELECT COUNT(*) FROM asset").fetchone()[0])
        self.conn.execute(
            """UPDATE crawl_run SET finished_at=?, status=?, error_message=?,
               total_requests=COALESCE(?, total_requests),
               total_items=COALESCE(?, total_items),
               total_assets=COALESCE(?, total_assets)
               WHERE id=?""",
            (now(), status, error_message, total_requests, total_items, total_assets, run_id),
        )
        self.conn.commit()

    def add_request(self, run_id: int, request_type: str, endpoint: str, **fields: object) -> int:
        cursor = self.conn.execute(
            """INSERT INTO crawl_request
            (run_id, request_type, endpoint, device_type, content_type, category_id,
             search_keyword, page, page_size, requested_at, response_hash, response_json, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run_id, request_type, endpoint, fields.get("device_type"), fields.get("content_type"),
                fields.get("category_id"), fields.get("search_keyword"), fields.get("page"),
                fields.get("page_size"), now(), fields.get("response_hash"), fields.get("response_json"),
                fields.get("error_message"),
            ),
        )
        self.conn.commit()
        return int(cursor.lastrowid)

    def _category_id(self, item: WallpaperData, category: object) -> int:
        name = category.name
        remote_key = category.remote_key or name
        parent_id = None
        if category.parent_name:
            parent_id = self._category_id(
                item,
                CategoryData(category.parent_name, level=1, remote_key=category.parent_name),
            )
        self.conn.execute(
            """INSERT INTO category(source, device_type, content_type, remote_key, name, level, parent_id, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(source, device_type, content_type, remote_key, name)
               DO UPDATE SET sort_order=excluded.sort_order, parent_id=excluded.parent_id""",
            (item.source, item.device_type, item.content_type, remote_key, name, category.level, parent_id, category.sort_order),
        )
        row = self.conn.execute(
            "SELECT id FROM category WHERE source=? AND device_type=? AND content_type=? AND remote_key=? AND name=?",
            (item.source, item.device_type, item.content_type, remote_key, name),
        ).fetchone()
        assert row is not None
        return int(row[0])

    def wallpaper_exists(self, stable_key: str) -> bool:
        return self.conn.execute("SELECT 1 FROM wallpaper WHERE stable_key=?", (stable_key,)).fetchone() is not None

    def get_cursor(
        self,
        source: str,
        device_type: str,
        content_type: str,
        scope_type: str,
        scope_key: str,
    ) -> sqlite3.Row | None:
        return self.conn.execute(
            """SELECT * FROM crawl_cursor
               WHERE source=? AND device_type=? AND content_type=? AND scope_type=? AND scope_key=?""",
            (source, device_type, content_type, scope_type, scope_key),
        ).fetchone()

    def update_cursor(
        self,
        *,
        source: str,
        device_type: str,
        content_type: str,
        scope_type: str,
        scope_key: str,
        last_remote_created_at: str | None,
        last_remote_id: str | None,
        last_page_hash: str | None,
    ) -> None:
        self.conn.execute(
            """INSERT INTO crawl_cursor
               (source, device_type, content_type, scope_type, scope_key,
                last_remote_created_at, last_remote_id, last_page_hash, last_success_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(source, device_type, content_type, scope_type, scope_key)
               DO UPDATE SET
                 last_remote_created_at=COALESCE(excluded.last_remote_created_at, crawl_cursor.last_remote_created_at),
                 last_remote_id=COALESCE(excluded.last_remote_id, crawl_cursor.last_remote_id),
                 last_page_hash=COALESCE(excluded.last_page_hash, crawl_cursor.last_page_hash),
                 last_success_at=excluded.last_success_at""",
            (
                source,
                device_type,
                content_type,
                scope_type,
                scope_key,
                last_remote_created_at,
                last_remote_id,
                last_page_hash,
                now(),
            ),
        )
        self.conn.commit()

    def reconcile_full_run(self, run_id: int, source: str, device_type: str, content_type: str) -> int:
        cursor = self.conn.execute(
            """UPDATE wallpaper
               SET missing_count=missing_count + 1,
                   status=CASE WHEN missing_count + 1 >= 2 THEN 'inactive' ELSE 'missing' END,
                   updated_at=?
               WHERE source=? AND device_type=? AND content_type=?
                 AND (last_seen_run_id IS NULL OR last_seen_run_id<>?)""",
            (now(), source, device_type, content_type, run_id),
        )
        self.conn.commit()
        return int(cursor.rowcount)

    def upsert_item(
        self,
        item: WallpaperData,
        request_id: int,
        query_keywords: Iterable[str] = (),
        *,
        run_id: int | None = None,
    ) -> int:
        timestamp = now()
        self.conn.execute(
            """INSERT INTO wallpaper
            (source, remote_id, remote_qid, stable_key, device_type, content_type, title, author,
             fee_type, price, resolution_raw, width, height, duration_seconds, remote_created_at,
             first_seen_at, last_seen_at, updated_at, raw_json, status, last_seen_run_id, missing_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0)
            ON CONFLICT(stable_key) DO UPDATE SET
              title=excluded.title, author=excluded.author, fee_type=excluded.fee_type,
              price=excluded.price, resolution_raw=excluded.resolution_raw, width=excluded.width,
              height=excluded.height, duration_seconds=excluded.duration_seconds,
              remote_created_at=excluded.remote_created_at, last_seen_at=excluded.last_seen_at,
              updated_at=excluded.updated_at, raw_json=excluded.raw_json,
              status='active', last_seen_run_id=excluded.last_seen_run_id, missing_count=0""",
            (item.source, item.remote_id, item.remote_qid, item.stable_key, item.device_type, item.content_type,
             item.title, item.author, item.fee_type, item.price, item.resolution_raw, item.width, item.height,
             item.duration_seconds, item.remote_created_at, timestamp, timestamp, timestamp, item.raw_json, run_id),
        )
        row = self.conn.execute("SELECT id FROM wallpaper WHERE stable_key=?", (item.stable_key,)).fetchone()
        assert row is not None
        wallpaper_id = int(row[0])
        for category in item.categories:
            category_id = self._category_id(item, category)
            relation = "secondary" if category.level == 2 else "primary"
            self.conn.execute(
                "INSERT OR IGNORE INTO wallpaper_category(wallpaper_id, category_id, relation_type) VALUES (?, ?, ?)",
                (wallpaper_id, category_id, relation),
            )
        all_keywords = list(item.keywords) + [(value, "query") for value in query_keywords]
        for value, kind in all_keywords:
            self.conn.execute("INSERT OR IGNORE INTO keyword(keyword, keyword_type) VALUES (?, ?)", (value, kind))
            keyword_id = self.conn.execute(
                "SELECT id FROM keyword WHERE keyword=? AND keyword_type=?", (value, kind)
            ).fetchone()[0]
            self.conn.execute(
                "INSERT OR IGNORE INTO wallpaper_keyword(wallpaper_id, keyword_id, matched_at) VALUES (?, ?, ?)",
                (wallpaper_id, keyword_id, timestamp),
            )
        for order, asset in enumerate(item.assets):
            url = normalize_url(asset.url)
            self.conn.execute(
                """INSERT INTO asset(url, normalized_url, media_type, media_role, width, height, duration_seconds,
                   mime_type, first_checked_at, last_checked_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(url) DO UPDATE SET normalized_url=excluded.normalized_url,
                     last_checked_at=excluded.last_checked_at""",
                (url, url, asset.media_type, asset.media_role, asset.width, asset.height,
                 asset.duration_seconds, asset.mime_type, timestamp, timestamp),
            )
            asset_id = self.conn.execute("SELECT id FROM asset WHERE url=?", (url,)).fetchone()[0]
            self.conn.execute(
                "INSERT OR IGNORE INTO wallpaper_asset(wallpaper_id, asset_id, is_primary, sort_order) VALUES (?, ?, ?, ?)",
                (wallpaper_id, asset_id, 1 if order == 0 else 0, order),
            )
        self.conn.execute(
            "INSERT OR IGNORE INTO wallpaper_discovery(request_id, wallpaper_id, result_rank, discovered_at) VALUES (?, ?, ?, ?)",
            (request_id, wallpaper_id, None, timestamp),
        )
        self.conn.commit()
        return wallpaper_id

    def stats(self) -> list[sqlite3.Row]:
        return self.conn.execute(
            """SELECT device_type, content_type, COUNT(*) AS count
               FROM wallpaper GROUP BY device_type, content_type ORDER BY device_type, content_type"""
        ).fetchall()

    def asset_rows(self) -> list[sqlite3.Row]:
        return self.conn.execute("SELECT id, url FROM asset ORDER BY id").fetchall()

    def update_asset_check(self, asset_id: int, status: int, accessible: bool, mime_type: str | None) -> None:
        self.conn.execute(
            "UPDATE asset SET http_status=?, accessible=?, mime_type=?, last_checked_at=? WHERE id=?",
            (status, int(accessible), mime_type, now(), asset_id),
        )
        self.conn.commit()
