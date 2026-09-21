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
    """读某个**分类切片**里的条目 id 集合。

    索引（`catalog.json`）里没有 `items` —— 那是它的设计目标（要足够小），
    所以这个辅助函数只能用于分类文件。
    """
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


# ── 索引结构 ──────────────────────────────────────────────────────


def test_catalog_shape(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"

    catalog_path, _ = export_livewall_catalog(source, output_dir)
    catalog = _read(catalog_path)

    assert catalog["schemaVersion"] == 1
    assert catalog["source"]["deviceType"] == "desktop"
    assert catalog["source"]["contentType"] == "dynamic"
    assert catalog["defaultCategoryId"] == 4001
    assert set(catalog) == {
        "schemaVersion",
        "generatedAt",
        "source",
        "defaultCategoryId",
        "categories",
    }


def test_index_has_no_items(tmp_path):
    """索引**刻意不含条目** —— 它是启动时唯一必拉的文件，必须很小。

    这条锁住这个约定：谁要是把 `items` 加回来，客户端就会又变成
    「一次下全量」，那个 4.9 MB 的问题会原地复活。
    """
    source = _make_db(tmp_path, BASE_ROWS)

    catalog_path, _ = export_livewall_catalog(source, tmp_path / "data")
    catalog = _read(catalog_path)

    assert "items" not in catalog
    # 索引本身应该是几百字节量级，而不是随条目数增长
    assert catalog_path.stat().st_size < 2048


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


def test_category_items_carry_root_category_ids(tmp_path):
    """条目上的 `categoryIds` 是**一级分类** id：二级、三级都递归归属到根。"""
    source = _make_db(tmp_path, BASE_ROWS)

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")
    beauty = {item["id"]: item for item in _read(category_paths["美女"])["items"]}

    assert beauty[1]["categoryIds"] == [4001]
    # 二级分类的壁纸归属到一级分类
    assert beauty[2]["categoryIds"] == [4001]
    # 三级分类同样递归归属到一级分类
    assert beauty[5]["categoryIds"] == [4001]

    scenery = _read(category_paths["风景"])["items"]
    assert [item["categoryIds"] for item in scenery] == [[5000]]


def test_wallpaper_without_category_appears_in_no_slice(tmp_path):
    """不挂任何分类的壁纸 4 不属于任何切片 —— 索引里也没有它。

    这是「按分类单独加载」的必然结果：它谁都不属于，所以哪儿都到不了。
    实测线上数据里没有这种条目（每张壁纸都挂了一个一级分类）。
    """
    source = _make_db(tmp_path, BASE_ROWS)

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")

    assert all(4 not in _items(path) for path in category_paths.values())


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
        "coverUrl",
        "durationSeconds",
        "tags",
        "categoryIds",
    }
    # duration_seconds 在库里是 NULL，导出保持 null，不伪造默认值
    assert item["durationSeconds"] is None
    assert item["url"].startswith("https://")
    # BASE_ROWS 里每张壁纸只有 video_preview、没有 image → 静态图地址为 null
    assert item["coverUrl"] is None


def test_category_files_share_generated_at(tmp_path):
    """索引与分类文件必须同批生成，否则客户端无法判断谁更新。"""
    source = _make_db(tmp_path, BASE_ROWS)

    catalog_path, category_paths = export_livewall_catalog(source, tmp_path / "data")

    generated_at = _read(catalog_path)["generatedAt"]
    assert all(_read(path)["generatedAt"] == generated_at for path in category_paths.values())


def test_no_matches_writes_index_without_category_files(tmp_path):
    """壁纸没挂任何分类时索引仍然写出，只是没有分类文件。"""
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
    # 一个分类文件都不该落盘
    assert sorted(p.name for p in (output_dir / "livewall").iterdir()) == ["catalog.json"]


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


def test_image_role_is_not_a_playable_url(tmp_path):
    """`image` 角色不是播放地址：只剩它的壁纸整体不进清单。

    注意它**不再是「被排除的角色」** —— 现在 image 会作为 `coverUrl` 导出
    （见下面「静态图」一节的用例），但它永远不能顶替 `url` 当播放地址。
    """
    source = _make_db(
        tmp_path,
        BASE_ROWS.replace(
            "(11, 'https://cdn.test/b.mp4', 'video_preview', 1)",
            "(11, 'https://cdn.test/b.mp4', 'image', 1)",
        ),
    )

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")

    # 壁纸 2 只剩 image：没有可播放地址，整条不导出
    assert _items(category_paths["美女"]) == {1, 5}


def test_skips_inactive_wallpapers(tmp_path):
    source = _make_db(tmp_path, BASE_ROWS.replace("(2, 'active'", "(2, 'inactive'"))

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")

    assert _items(category_paths["美女"]) == {1, 5}
    assert _items(category_paths["风景"]) == {3}


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

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")
    items = _read(category_paths["美女"])["items"]

    assert len([item for item in items if item["id"] == 1]) == 1


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


# ── 静态图（coverUrl）────────────────────────────────────────────
# 客户端的「锁屏预览」与「下载当前壁纸」都要用这个地址：它来自
# `media_role='image'` 的资源，与播放地址走同一个 ORDER BY 取第一条。


def test_exports_cover_url(tmp_path):
    """有 image 资源时其地址作为 coverUrl 导出，且不影响 url。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO asset VALUES (20, 'https://cdn.test/a.jpg', 'image', 1);
        INSERT INTO wallpaper_asset VALUES (1, 20, 1, 0);
        """,
    )

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")
    item = next(item for item in _read(category_paths["美女"])["items"] if item["id"] == 1)

    assert item["url"] == "https://cdn.test/a.mp4"
    assert item["coverUrl"] == "https://cdn.test/a.jpg"


def test_cover_url_missing_is_null(tmp_path):
    """没有 image 资源时 coverUrl 为 null —— 客户端据此退回「抓当前帧」。"""
    source = _make_db(tmp_path, BASE_ROWS)

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")
    item = next(item for item in _read(category_paths["美女"])["items"] if item["id"] == 1)

    assert item["coverUrl"] is None


def test_cover_url_follows_primary_and_sort_order(tmp_path):
    """同一壁纸有多个 image 时，按关联表的主资源与排序取第一条。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO asset VALUES (21, 'https://cdn.test/a-cover-late.jpg', 'image', 1);
        INSERT INTO wallpaper_asset VALUES (1, 21, 0, 5);
        INSERT INTO asset VALUES (22, 'https://cdn.test/a-cover-first.jpg', 'image', 1);
        INSERT INTO wallpaper_asset VALUES (1, 22, 1, 0);
        """,
    )

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")
    item = next(item for item in _read(category_paths["美女"])["items"] if item["id"] == 1)

    assert item["coverUrl"] == "https://cdn.test/a-cover-first.jpg"


def test_cover_url_ignores_inaccessible_image(tmp_path):
    """不可访问的 image 不能当静态图地址（与播放地址同一条 accessible=1 过滤）。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO asset VALUES (23, 'https://cdn.test/a-broken.jpg', 'image', 0);
        INSERT INTO wallpaper_asset VALUES (1, 23, 1, 0);
        """,
    )

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")
    item = next(item for item in _read(category_paths["美女"])["items"] if item["id"] == 1)

    assert item["coverUrl"] is None


def test_cover_url_does_not_leak_between_wallpapers(tmp_path):
    """静态图按壁纸 id 归属，不会串到别的条目上。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO asset VALUES (24, 'https://cdn.test/c.jpg', 'image', 1);
        INSERT INTO wallpaper_asset VALUES (3, 24, 1, 0);
        """,
    )

    _, category_paths = export_livewall_catalog(source, tmp_path / "data")
    scenery = {item["id"]: item for item in _read(category_paths["风景"])["items"]}
    beauty = {item["id"]: item for item in _read(category_paths["美女"])["items"]}

    assert scenery[3]["coverUrl"] == "https://cdn.test/c.jpg"
    assert beauty[1]["coverUrl"] is None


# ── 切片摘要与索引签名（内容清单的完整性）─────────────────────────
#
# 索引里为每个**有内容的**分类记了它那份切片的 sha256，客户端据此校验收到的切片。
# 索引自身的完整性由外部签名（`catalog.json.sig`，本机离线私钥）保证 ——
# 所以这里只负责「摘要写对、且与写盘字节逐字节对应」。


def _sha256(data: bytes) -> str:
    import hashlib

    return hashlib.sha256(data).hexdigest()


def test_category_entries_carry_sha256_of_slice_bytes(tmp_path):
    """每条有内容的分类都带摘要，且等于**切片文件的实际字节**摘要。

    这条是整条链的地基：客户端的校验就是「收到的字节重算 sha256，
    与索引里记的比」。两边口径一旦分家（改编码、加尾随换行），
    表现是**所有切片都判完整性失败** —— 症状离原因很远，会先怀疑网络或 CDN。
    """
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"

    catalog_path, category_paths = export_livewall_catalog(source, output_dir)
    entries = {entry["name"]: entry for entry in _read(catalog_path)["categories"]}

    for name, path in category_paths.items():
        declared = entries[name]["sha256"]
        assert len(declared) == 64, f"{name} 的摘要不是 64 位"
        assert declared == declared.lower(), f"{name} 的摘要应是小写十六进制"
        assert declared == _sha256(path.read_bytes()), f"{name} 的摘要与文件字节不符"


def test_empty_category_entry_has_no_sha256(tmp_path):
    """空分类不落文件，因此也不该有摘要 —— 客户端只在有 `file` 时才要求它。"""
    source = _make_db(
        tmp_path,
        BASE_ROWS
        + """
        INSERT INTO category VALUES (6000, '分区', NULL, 'desktop', 'dynamic', 1, 2);
        """,
    )

    catalog_path, _ = export_livewall_catalog(source, tmp_path / "data")
    entries = {entry["name"]: entry for entry in _read(catalog_path)["categories"]}

    assert entries["分区"]["file"] is None
    assert "sha256" not in entries["分区"]


def test_index_has_no_self_digest(tmp_path):
    """索引**不写自己的摘要** —— 它由外部签名覆盖，自指摘要只会是第二套真相。

    索引的完整性走 `catalog.json.sig`（Ed25519，本机离线私钥）。若这里再写一个
    自己的 sha256，客户端就得决定「信哪个」，而两个值不同步时无从判断谁对。
    """
    source = _make_db(tmp_path, BASE_ROWS)

    catalog_path, _ = export_livewall_catalog(source, tmp_path / "data")
    catalog = _read(catalog_path)

    assert "sha256" not in catalog
    assert "sha256" not in catalog["source"]


def test_digest_is_recomputed_on_each_export(tmp_path):
    """重复导出时摘要跟着内容重算，不是上一轮留下的常量。

    `generatedAt` 每次都变，所以切片的字节也每次都变 —— 摘要若不变，
    说明它是缓存来的，而缓存来的摘要迟早会与文件分家。
    """
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"

    catalog_path, _ = export_livewall_catalog(source, output_dir)
    first = {e["name"]: e["sha256"] for e in _read(catalog_path)["categories"]}

    catalog_path, category_paths = export_livewall_catalog(source, output_dir)
    second = {e["name"]: e["sha256"] for e in _read(catalog_path)["categories"]}

    assert first != second, "两次导出的摘要完全相同，说明没有按实际内容算"
    # 关键：第二轮之后，每条摘要仍与磁盘上的文件一致
    for name, path in category_paths.items():
        assert second[name] == _sha256(path.read_bytes())


def test_removes_stale_signature(tmp_path):
    """索引一重写，上一轮的签名就必然失效 —— 导出必须把它删掉。

    留着它的后果**比「没有签名」糟得多**：新索引配旧签名，客户端报「签名与清单不符」，
    而人只会去怀疑密钥或密码学，排查方向完全错。删掉之后最坏是「缺签名」，
    症状直指「发布流程漏了一步」。
    """
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"
    livewall_dir = output_dir / "livewall"
    livewall_dir.mkdir(parents=True)
    stale = livewall_dir / "catalog.json.sig"
    stale.write_text('{"alg":"ed25519","signature":"AAAA"}', encoding="utf-8")

    export_livewall_catalog(source, output_dir)

    assert not stale.exists()


def test_export_does_not_sign(tmp_path):
    """导出**不产出**签名文件：签名要用本机离线私钥，只有发布链路上那一步能做。

    这条锁住职责边界 —— 采集器跑在什么机器上都可能，私钥只在持有它的机器上。
    """
    source = _make_db(tmp_path, BASE_ROWS)
    output_dir = tmp_path / "data"

    export_livewall_catalog(source, output_dir)

    assert not (output_dir / "livewall" / "catalog.json.sig").exists()
    assert sorted(p.name for p in (output_dir / "livewall").iterdir()) == [
        "catalog.json",
        "category.4001.json",
        "category.5000.json",
    ]


def test_digest_mismatch_aborts_export(tmp_path, monkeypatch):
    """写盘后回读对账：摘要与文件不一致就**抛错中止**，不产出这份清单。

    用桩把摘要函数改成「每次调用返回不同值」，于是写盘时记下的摘要在回读时必然对不上 ——
    这模拟的是「写出去的字节与算摘要的字节分了家」（改编码、加一层格式化、被压缩）。
    不拦住的后果是客户端**每个切片都判完整性失败**，而那看起来像 CDN 的问题。
    """
    from wallpapers import export as export_module

    counter = {"n": 0}

    def drifting_digest(data: bytes) -> str:
        counter["n"] += 1
        return f"{counter['n']:064x}"

    monkeypatch.setattr(export_module, "_sha256_hex", drifting_digest)

    source = _make_db(tmp_path, BASE_ROWS)
    with pytest.raises(RuntimeError, match="摘要与写出的文件不一致"):
        export_livewall_catalog(source, tmp_path / "data")
