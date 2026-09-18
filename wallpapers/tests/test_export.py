import json
import sqlite3

import pytest

from wallpapers.export import export_livewall_catalog

SCHEMA = """
CREATE TABLE wallpaper (
    id INTEGER PRIMARY KEY, status TEXT, device_type TEXT, content_type TEXT,
    title TEXT, author TEXT, remote_created_at TEXT, first_seen_at TEXT
);
CREATE TABLE asset (
    id INTEGER PRIMARY KEY, url TEXT, media_role TEXT, accessible INTEGER
);
CREATE TABLE wallpaper_asset (
    wallpaper_id INTEGER, asset_id INTEGER, is_primary INTEGER, sort_order INTEGER
);
CREATE TABLE category (
    id INTEGER PRIMARY KEY, name TEXT, parent_id INTEGER,
    device_type TEXT, content_type TEXT, level INTEGER, sort_order INTEGER
);
CREATE TABLE wallpaper_category (
    wallpaper_id INTEGER, category_id INTEGER
);
CREATE TABLE keyword (
    id INTEGER PRIMARY KEY, keyword TEXT, keyword_type TEXT
);
CREATE TABLE wallpaper_keyword (
    wallpaper_id INTEGER, keyword_id INTEGER, match_rank INTEGER
);
"""


def _make_db(tmp_path, script: str):
    path = tmp_path / "source.db"
    with sqlite3.connect(path) as db:
        db.executescript(SCHEMA)
        if script:
            db.executescript(script)
        db.commit()
    return path


BASE_ROWS = """
INSERT INTO category VALUES (4001, '美女', NULL, 'desktop', 'dynamic', 1, 0);
INSERT INTO category VALUES (64578, '清纯美女', 4001, 'desktop', 'dynamic', 2, 0);
INSERT INTO wallpaper VALUES
    (1, 'active', 'desktop', 'dynamic', 'A', 'auth', '2026-01-02', '2026-01-02'),
    (2, 'active', 'desktop', 'dynamic', 'B', 'auth', '2026-01-03', '2026-01-03');
INSERT INTO wallpaper_category VALUES (1, 4001), (2, 64578);
INSERT INTO asset VALUES
    (10, 'https://cdn.test/a.mp4', 'video_preview', 1),
    (11, 'https://cdn.test/b.mp4', 'video_preview', 1);
INSERT INTO wallpaper_asset VALUES (1, 10, 1, 0), (2, 11, 1, 0);
"""


def test_exports_items_with_expected_shape(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)
    output = tmp_path / "catalog.json"

    path, count = export_livewall_catalog(source, output, category="美女")

    assert path == output.resolve()
    assert count == 2
    catalog = json.loads(output.read_text(encoding="utf-8"))
    assert catalog["schemaVersion"] == 1
    assert catalog["source"]["deviceType"] == "desktop"
    assert catalog["source"]["contentType"] == "dynamic"
    assert catalog["source"]["categoryName"] == "美女"
    assert 4001 in catalog["source"]["categoryIds"]

    item = catalog["items"][0]
    assert set(item) == {"id", "title", "author", "url", "durationSeconds", "tags"}
    # duration_seconds 在库里是 NULL，导出保持 null，不伪造默认值
    assert item["durationSeconds"] is None
    assert item["url"].startswith("https://")


def test_category_filter_matches_parent_name(tmp_path):
    """二级分类挂在「美女」下时，用一级分类名过滤也应命中。"""
    source = _make_db(tmp_path, BASE_ROWS)
    output = tmp_path / "catalog.json"

    _, count = export_livewall_catalog(source, output, category="美女")

    catalog = json.loads(output.read_text(encoding="utf-8"))
    assert count == 2
    assert {item["id"] for item in catalog["items"]} == {1, 2}


def test_category_filter_excludes_other_categories(tmp_path):
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO category VALUES (5000, '风景', NULL, 'desktop', 'dynamic', 1, 0);
        INSERT INTO wallpaper VALUES (3, 'active', 'desktop', 'dynamic', 'C', '', '2026-01-04', '2026-01-04');
        INSERT INTO wallpaper_category VALUES (3, 5000);
        INSERT INTO asset VALUES (12, 'https://cdn.test/c.mp4', 'video_preview', 1);
        INSERT INTO wallpaper_asset VALUES (3, 12, 1, 0);
        """,
    )
    output = tmp_path / "catalog.json"

    _, count = export_livewall_catalog(source, output, category="美女")

    assert count == 2


def test_empty_category_means_no_filter(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)
    output = tmp_path / "catalog.json"

    _, count = export_livewall_catalog(source, output, category=None)

    assert count == 2


def test_skips_inaccessible_assets(tmp_path):
    source = _make_db(
        tmp_path,
        BASE_ROWS.replace("(11, 'https://cdn.test/b.mp4', 'video_preview', 1)", "(11, 'https://cdn.test/b.mp4', 'video_preview', 0)"),
    )
    output = tmp_path / "catalog.json"

    _, count = export_livewall_catalog(source, output, category="美女")

    assert count == 1


def test_skips_non_video_preview_roles(tmp_path):
    """image / cover 等角色不是可播放地址，必须排除。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS.replace("'video_preview', 1),\n    (11", "'image', 1),\n    (11"),
    )
    output = tmp_path / "catalog.json"

    _, count = export_livewall_catalog(source, output, category="美女")

    assert count == 1
    catalog = json.loads(output.read_text(encoding="utf-8"))
    assert catalog["items"][0]["id"] == 2


def test_skips_inactive_wallpapers(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS.replace("(2, 'active'", "(2, 'inactive'"))
    output = tmp_path / "catalog.json"

    _, count = export_livewall_catalog(source, output, category="美女")

    assert count == 1


def test_deduplicates_multiple_preview_assets_per_wallpaper(tmp_path):
    """同一壁纸有多个 video_preview 时只保留一条。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO asset VALUES (99, 'https://cdn.test/a-alt.mp4', 'video_preview', 1);
        INSERT INTO wallpaper_asset VALUES (1, 99, 0, 1);
        """,
    )
    output = tmp_path / "catalog.json"

    _, count = export_livewall_catalog(source, output, category="美女")

    catalog = json.loads(output.read_text(encoding="utf-8"))
    assert count == 2
    assert len([item for item in catalog["items"] if item["id"] == 1]) == 1


def test_prefers_primary_preview_and_sort_order(tmp_path):
    """多个预览资源时遵循关联表的主资源和排序语义。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO asset VALUES (98, 'https://cdn.test/a-secondary.mp4', 'video_preview', 1);
        INSERT INTO wallpaper_asset VALUES (1, 98, 0, 0);
        UPDATE wallpaper_asset SET is_primary = 1, sort_order = 9
         WHERE wallpaper_id = 1 AND asset_id = 10;
        """,
    )
    output = tmp_path / "catalog.json"

    export_livewall_catalog(source, output, category="美女")

    catalog = json.loads(output.read_text(encoding="utf-8"))
    item = next(item for item in catalog["items"] if item["id"] == 1)
    assert item["url"] == "https://cdn.test/a.mp4"


def test_collects_tags_capped_at_four(tmp_path):
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO keyword VALUES (1, 'tag1', 'tag'), (2, 'tag2', 'tag'),
                                   (3, 'tag3', 'tag'), (4, 'tag4', 'tag'), (5, 'tag5', 'tag');
        INSERT INTO wallpaper_keyword VALUES
            (1, 1, 1), (1, 2, 2), (1, 3, 3), (1, 4, 4), (1, 5, 5);
        """,
    )
    output = tmp_path / "catalog.json"

    export_livewall_catalog(source, output, category="美女")

    catalog = json.loads(output.read_text(encoding="utf-8"))
    tags = next(item["tags"] for item in catalog["items"] if item["id"] == 1)
    assert tags == ["tag1", "tag2", "tag3", "tag4"]


def test_ignores_query_keywords(tmp_path):
    """keyword_type='query' 是抓取时的搜索词，不是资源标签。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO keyword VALUES (1, '搜索词', 'query');
        INSERT INTO wallpaper_keyword VALUES (1, 1, 1);
        """,
    )
    output = tmp_path / "catalog.json"

    export_livewall_catalog(source, output, category="美女")

    catalog = json.loads(output.read_text(encoding="utf-8"))
    assert next(item["tags"] for item in catalog["items"] if item["id"] == 1) == []


def test_no_matches_writes_empty_catalog(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)
    output = tmp_path / "catalog.json"

    _, count = export_livewall_catalog(source, output, category="不存在的分类")

    assert count == 0
    catalog = json.loads(output.read_text(encoding="utf-8"))
    assert catalog["items"] == []
    assert catalog["source"]["categoryIds"] == []


def test_creates_output_directory(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)
    output = tmp_path / "nested" / "dir" / "catalog.json"

    path, _ = export_livewall_catalog(source, output, category="美女")

    assert path.exists()


def test_missing_database_raises(tmp_path):
    with pytest.raises(sqlite3.OperationalError):
        export_livewall_catalog(tmp_path / "nope.db", tmp_path / "out.json", category="美女")


def test_works_without_match_rank_column(tmp_path):
    """旧版数据库的 wallpaper_keyword 可能没有 match_rank 列。

    回归保护：曾经把缺失的列替换成字面量 999999 写进 ORDER BY，
    而 SQLite 会把 ORDER BY 里的常量整数当成「第 N 列」的位置引用，
    999999 超出结果集列数会直接抛 OperationalError。
    """
    path = tmp_path / "legacy.db"
    with sqlite3.connect(path) as db:
        db.executescript(
            """
            CREATE TABLE wallpaper (
                id INTEGER PRIMARY KEY, status TEXT, device_type TEXT, content_type TEXT,
                title TEXT, author TEXT, remote_created_at TEXT, first_seen_at TEXT
            );
            CREATE TABLE asset (id INTEGER PRIMARY KEY, url TEXT, media_role TEXT, accessible INTEGER);
            CREATE TABLE wallpaper_asset (wallpaper_id INTEGER, asset_id INTEGER);
            CREATE TABLE category (
                id INTEGER PRIMARY KEY, name TEXT, parent_id INTEGER,
                device_type TEXT, content_type TEXT, level INTEGER, sort_order INTEGER
            );
            CREATE TABLE wallpaper_category (wallpaper_id INTEGER, category_id INTEGER);
            CREATE TABLE keyword (id INTEGER PRIMARY KEY, keyword TEXT, keyword_type TEXT);
            -- 刻意不含 match_rank
            CREATE TABLE wallpaper_keyword (wallpaper_id INTEGER, keyword_id INTEGER);
            """
        )
        db.executescript(
            """
            INSERT INTO category VALUES (4001, '美女', NULL, 'desktop', 'dynamic', 1, 0);
            INSERT INTO wallpaper VALUES
                (1, 'active', 'desktop', 'dynamic', 'A', '', '2026-01-02', '2026-01-02');
            INSERT INTO wallpaper_category VALUES (1, 4001);
            INSERT INTO asset VALUES (10, 'https://cdn.test/a.mp4', 'video_preview', 1);
            INSERT INTO wallpaper_asset VALUES (1, 10);
            INSERT INTO keyword VALUES (1, '标签', 'tag');
            INSERT INTO wallpaper_keyword VALUES (1, 1);
            """
        )
        db.commit()

    output = tmp_path / "catalog.json"
    _, count = export_livewall_catalog(path, output, category="美女")

    assert count == 1
    catalog = json.loads(output.read_text(encoding="utf-8"))
    assert catalog["items"][0]["tags"] == ["标签"]
