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


# 分类树：美女(4001) → 清纯美女(64578) → 校园(70000)，以及并列的风景(5000)。
# 壁纸 1 挂一级、2 挂二级、5 挂三级（用来验证递归子树）、3 挂风景、4 不挂任何分类。
BASE_ROWS = """
INSERT INTO category VALUES
    (4001, '美女', NULL, 'desktop', 'dynamic', 1, 0),
    (64578, '清纯美女', 4001, 'desktop', 'dynamic', 2, 0),
    (70000, '校园', 64578, 'desktop', 'dynamic', 2, 0),
    (5000, '风景', NULL, 'desktop', 'dynamic', 1, 1);
INSERT INTO wallpaper VALUES
    (1, 'active', 'desktop', 'dynamic', 'A', 'auth', '2026-01-02', '2026-01-02'),
    (2, 'active', 'desktop', 'dynamic', 'B', 'auth', '2026-01-03', '2026-01-03'),
    (3, 'active', 'desktop', 'dynamic', 'C', 'auth', '2026-01-04', '2026-01-04'),
    (4, 'active', 'desktop', 'dynamic', 'D', 'auth', '2026-01-05', '2026-01-05'),
    (5, 'active', 'desktop', 'dynamic', 'E', 'auth', '2026-01-06', '2026-01-06');
INSERT INTO wallpaper_category VALUES (1, 4001), (2, 64578), (3, 5000), (5, 70000);
INSERT INTO asset VALUES
    (10, 'https://cdn.test/a.mp4', 'video_preview', 1),
    (11, 'https://cdn.test/b.mp4', 'video_preview', 1),
    (12, 'https://cdn.test/c.mp4', 'video_preview', 1),
    (13, 'https://cdn.test/d.mp4', 'video_preview', 1),
    (14, 'https://cdn.test/e.mp4', 'video_preview', 1);
INSERT INTO wallpaper_asset VALUES
    (1, 10, 1, 0), (2, 11, 1, 0), (3, 12, 1, 0), (4, 13, 1, 0), (5, 14, 1, 0);
"""


def _read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def _items(path):
    return {item["id"] for item in _read(path)["items"]}


# ── 输出路径与命名 ────────────────────────────────────────────────


def test_writes_catalog_and_category_files_under_livewall_dir(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"

    catalog_path, category_paths = export_livewall_catalog(source, output_dir)

    assert catalog_path == (output_dir / "livewall" / "catalog.json").resolve()
    assert catalog_path.exists()
    # 分类文件名用数字 id，不用中文分类名
    assert category_paths["美女"] == (output_dir / "livewall" / "category.4001.json").resolve()
    assert category_paths["风景"] == (output_dir / "livewall" / "category.5000.json").resolve()
    assert sorted(p.name for p in (output_dir / "livewall").iterdir()) == [
        "catalog.json",
        "category.4001.json",
        "category.5000.json",
    ]


def test_creates_output_directory(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "nested" / "dir"

    catalog_path, _ = export_livewall_catalog(source, output_dir)

    assert catalog_path.exists()


def test_removes_stale_category_files(tmp_path):
    """分类被删或改名后会留下孤儿文件，导出必须清理。"""
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"
    livewall_dir = output_dir / "livewall"
    livewall_dir.mkdir(parents=True)
    stale = livewall_dir / "category.999.json"
    stale.write_text("{}", encoding="utf-8")

    export_livewall_catalog(source, output_dir)

    assert not stale.exists()


# ── 总文件结构 ────────────────────────────────────────────────────


def test_catalog_shape(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"

    catalog_path, _ = export_livewall_catalog(source, output_dir)
    catalog = _read(catalog_path)

    assert catalog["schemaVersion"] == 1
    assert catalog["source"]["deviceType"] == "desktop"
    assert catalog["source"]["contentType"] == "dynamic"
    assert catalog["defaultCategoryId"] == 4001
    # 总文件是全量超集：不挂任何分类的壁纸 4 也在里面
    assert _items(catalog_path) == {1, 2, 3, 4, 5}


def test_catalog_lists_every_category_including_empty(tmp_path):
    """空分类也要登记（客户端菜单需要显示全部），但不落分类文件。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO category VALUES (6000, '分区', NULL, 'desktop', 'dynamic', 1, 2);
        """,
    )
    output_dir = tmp_path / "data"

    catalog_path, category_paths = export_livewall_catalog(source, output_dir)
    catalog = _read(catalog_path)

    entries = {entry["name"]: entry for entry in catalog["categories"]}
    assert set(entries) == {"美女", "风景", "分区"}
    assert entries["分区"]["itemCount"] == 0
    assert entries["分区"]["file"] is None
    assert "分区" not in category_paths
    assert not (output_dir / "livewall" / "category.6000.json").exists()


def test_categories_are_ordered_with_default_first(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"

    catalog_path, _ = export_livewall_catalog(source, output_dir)
    catalog = _read(catalog_path)

    # 默认分类排首位，其余保持 sort_order, id 原序
    assert [entry["name"] for entry in catalog["categories"]] == ["美女", "风景"]

    catalog_path, _ = export_livewall_catalog(source, output_dir, default_category="风景")
    catalog = _read(catalog_path)
    assert catalog["defaultCategoryId"] == 5000
    assert [entry["name"] for entry in catalog["categories"]] == ["风景", "美女"]


def test_default_category_accepts_id(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)

    catalog_path, _ = export_livewall_catalog(source, tmp_path / "data", default_category=5000)

    assert _read(catalog_path)["defaultCategoryId"] == 5000


def test_unknown_default_category_falls_back_to_first(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)

    catalog_path, _ = export_livewall_catalog(
        source, tmp_path / "data", default_category="不存在的分类"
    )

    assert _read(catalog_path)["defaultCategoryId"] == 4001


def test_catalog_items_carry_root_category_ids(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)

    catalog_path, _ = export_livewall_catalog(source, tmp_path / "data")
    catalog = _read(catalog_path)

    by_id = {item["id"]: item for item in catalog["items"]}
    assert by_id[1]["categoryIds"] == [4001]
    # 二级分类的壁纸归属到一级分类
    assert by_id[2]["categoryIds"] == [4001]
    # 三级分类同样递归归属到一级分类
    assert by_id[5]["categoryIds"] == [4001]
    assert by_id[3]["categoryIds"] == [5000]
    # 不挂分类的条目 categoryIds 为空
    assert by_id[4]["categoryIds"] == []


def test_catalog_entries_expose_file_and_count(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)

    catalog_path, _ = export_livewall_catalog(source, tmp_path / "data")
    catalog = _read(catalog_path)

    entries = {entry["name"]: entry for entry in catalog["categories"]}
    assert entries["美女"]["file"] == "category.4001.json"
    assert entries["美女"]["itemCount"] == 3  # 壁纸 1、2、5
    assert entries["风景"]["itemCount"] == 1


# ── 分类文件结构 ──────────────────────────────────────────────────


def test_category_file_matches_legacy_shape(tmp_path):
    """分类文件沿用旧版 livewall.json 的结构，客户端无需改解码器。"""
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"

    _, category_paths = export_livewall_catalog(source, output_dir)
    catalog = _read(category_paths["美女"])

    assert catalog["schemaVersion"] == 1
    assert catalog["source"]["categoryName"] == "美女"
    # 子树内的全部分类 id（含自身与各级子分类）
    assert catalog["source"]["categoryIds"] == [4001, 64578, 70000]
    assert set(catalog) == {"schemaVersion", "generatedAt", "source", "items"}


def test_category_file_contains_subtree_items(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"

    _, category_paths = export_livewall_catalog(source, output_dir)

    # 一级分类名命中整棵子树（含二级、三级）
    assert _items(category_paths["美女"]) == {1, 2, 5}
    assert _items(category_paths["风景"]) == {3}


def test_category_item_shape(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")
    item = _read(category_paths["风景"])["items"][0]

    assert set(item) == {
        "id",
        "title",
        "author",
        "url",
        "durationSeconds",
        "tags",
        "categoryIds",
    }
    # duration_seconds 在库里是 NULL，导出保持 null，不伪造默认值
    assert item["durationSeconds"] is None
    assert item["url"].startswith("https://")


def test_category_files_share_generated_at(tmp_path):
    """总文件与分类文件必须同批生成，否则客户端无法判断谁更新。"""
    source = _make_db(tmp_path, BASE_ROWS)

    catalog_path, category_paths = export_livewall_catalog(source, tmp_path / "data")

    generated_at = _read(catalog_path)["generatedAt"]
    assert all(_read(path)["generatedAt"] == generated_at for path in category_paths.values())


def test_no_matches_writes_catalog_without_category_files(tmp_path):
    """壁纸没挂任何分类时总文件仍然写出，只是没有分类文件。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        DELETE FROM wallpaper_category;
        """,
    )
    output_dir = tmp_path / "data"

    catalog_path, category_paths = export_livewall_catalog(source, output_dir)
    catalog = _read(catalog_path)

    assert category_paths == {}
    assert catalog["defaultCategoryId"] == 4001
    assert all(entry["itemCount"] == 0 for entry in catalog["categories"])
    assert _items(catalog_path) == {1, 2, 3, 4, 5}


# ── 条目筛选（沿用旧版规则，属回归保护）────────────────────────────


def test_skips_inaccessible_assets(tmp_path):
    source = _make_db(
        tmp_path,
        BASE_ROWS.replace(
            "(11, 'https://cdn.test/b.mp4', 'video_preview', 1)",
            "(11, 'https://cdn.test/b.mp4', 'video_preview', 0)",
        ),
    )

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")

    assert _items(category_paths["美女"]) == {1, 5}


def test_skips_non_video_preview_roles(tmp_path):
    """image / cover 等角色不是可播放地址，必须排除。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS.replace(
            "(11, 'https://cdn.test/b.mp4', 'video_preview', 1)",
            "(11, 'https://cdn.test/b.mp4', 'image', 1)",
        ),
    )

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")

    assert _items(category_paths["美女"]) == {1, 5}


def test_skips_inactive_wallpapers(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS.replace("(2, 'active'", "(2, 'inactive'"))

    catalog_path, category_paths = export_livewall_catalog(source, tmp_path / "data")

    assert _items(category_paths["美女"]) == {1, 5}
    assert _items(catalog_path) == {1, 3, 4, 5}


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

    catalog_path, _ = export_livewall_catalog(source, tmp_path / "data")
    catalog = _read(catalog_path)

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

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")

    item = next(item for item in _read(category_paths["美女"])["items"] if item["id"] == 1)
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

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")

    item = next(item for item in _read(category_paths["美女"])["items"] if item["id"] == 1)
    assert item["tags"] == ["tag1", "tag2", "tag3", "tag4"]


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

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")

    item = next(item for item in _read(category_paths["美女"])["items"] if item["id"] == 1)
    assert item["tags"] == []


def test_missing_database_raises(tmp_path):
    with pytest.raises(sqlite3.OperationalError):
        export_livewall_catalog(tmp_path / "nope.db", tmp_path / "data")


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
            -- is_primary / sort_order 属于基础表结构，旧库也有；这里只有 match_rank 是「可能缺失」的
            CREATE TABLE wallpaper_asset (wallpaper_id INTEGER, asset_id INTEGER, is_primary INTEGER, sort_order INTEGER);
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
            INSERT INTO wallpaper_asset VALUES (1, 10, 1, 0);
            INSERT INTO keyword VALUES (1, '标签', 'tag');
            INSERT INTO wallpaper_keyword VALUES (1, 1);
            """
        )
        db.commit()

    _, category_paths = export_livewall_catalog(path, tmp_path / "data")

    assert _read(category_paths["美女"])["items"][0]["tags"] == ["标签"]
