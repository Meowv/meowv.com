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

# 供 livewall 客户端使用的清单目录。索引与各分类文件都放在这个子目录下：
#   <output_dir>/livewall/catalog.json                索引（分类清单 + 默认分类，不含条目）
#   <output_dir>/livewall/category.<一级分类 id>.json  各分类的条目切片
# 放子目录有两个原因：一是与 Studio 的 wallpapers.catalog.* 分开 ——
# encrypt-wallpaper.mjs 要求该目录下「恰好 5 个」wallpapers.catalog.*.json，
# 多出来的文件会让它直接报错；二是发布时可以整目录拷贝。
LIVEWALL_DIR_NAME = "livewall"
CATALOG_FILE_NAME = "catalog.json"
CATEGORY_FILE_PREFIX = "category."

# 默认分类。与旧版 `export-livewall --category 美女` 的默认值保持一致 ——
# 该分类是当前唯一抓满内容的分类。
DEFAULT_CATEGORY_NAME = "美女"


def category_file_name(category_id: int) -> str:
    """分类文件名。用**数字 id** 而不是分类名：中文名进 URL 会触发百分号编码，
    CDN / nginx 侧行为不可控。"""
    return f"{CATEGORY_FILE_PREFIX}{category_id}.json"


def _fetch_items(
    source_db: sqlite3.Connection,
    *,
    device: str,
    content: str,
) -> list[dict[str, object]]:
    """查询目标壁纸及其视频地址。

    **刻意不带分类过滤**：分类切分在 Python 侧做，这样无论有多少个分类，
    数据库只扫一遍。`categoryIds` 留空，由 `export_livewall_catalog` 回填。
    """
    rows = source_db.execute(
        f"""
        SELECT w.id, w.title, w.author, a.url
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
         ORDER BY COALESCE(w.remote_created_at, w.first_seen_at) DESC,
                  w.id DESC,
                  COALESCE(wa.is_primary, 0) DESC,
                  COALESCE(wa.sort_order, 999999) ASC,
                  a.id ASC
        """,
        (device, content, VIDEO_ROLE),
    ).fetchall()

    tags = _fetch_tags(source_db)

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
                "url": str(row[3]),
                # 数据库里的 asset.duration_seconds 当前全为 NULL，客户端在播放时用
                # AVAsset 自行探测，不在这里伪造默认值
                "durationSeconds": None,
                "tags": tags.get(wallpaper_id, []),
                # 该条目所属的**一级分类** id（去重、升序），供排查与展示用
                "categoryIds": [],
            }
        )
    return items


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


def _fetch_root_categories(
    source_db: sqlite3.Connection,
    *,
    device: str,
    content: str,
) -> list[tuple[int, str]]:
    """一级分类（`parent_id IS NULL`），按 `sort_order, id` 升序。

    用 `parent_id IS NULL` 而不是 `level = 1` 判定根节点：父子关系才是分类树的
    真实结构，`level` 只是冗余的层级标记。

    注意 DB 里 `sort_order` 恒为 0（`pipeline._category_rows` 不写它），所以实际
    顺序是 id 升序，即「首次抓到该分类壁纸的先后」。顺序稳定性由 id 保证。
    """
    rows = source_db.execute(
        """
        SELECT id, name
          FROM category
         WHERE device_type = ? AND content_type = ? AND parent_id IS NULL
         ORDER BY sort_order, id
        """,
        (device, content),
    ).fetchall()
    return [(int(row[0]), str(row[1] or "")) for row in rows]


def _fetch_category_tree(
    source_db: sqlite3.Connection,
    *,
    device: str,
    content: str,
) -> dict[int, int]:
    """分类 id → 所属一级分类 id（一级分类自身映射到自己）。

    用递归 CTE 而不是「自身或直接父级」的两次比较：旧实现只看一层父级，
    三级及更深的分类会漏掉。当前数据是两层，递归是严格更正确的写法。
    """
    rows = source_db.execute(
        """
        WITH RECURSIVE tree(id, root_id) AS (
            SELECT id, id
              FROM category
             WHERE device_type = ? AND content_type = ? AND parent_id IS NULL
            UNION ALL
            SELECT c.id, tree.root_id
              FROM category AS c
              JOIN tree ON c.parent_id = tree.id
        )
        SELECT id, root_id FROM tree
        """,
        (device, content),
    ).fetchall()
    return {int(row[0]): int(row[1]) for row in rows}


def _fetch_wallpaper_roots(
    source_db: sqlite3.Connection,
    tree: dict[int, int],
) -> dict[int, list[int]]:
    """壁纸 id → 所属一级分类 id 列表（去重、升序）。

    一张壁纸可以同时挂在多个分类下（`wallpaper_category` 是多对多），
    因此它可能出现在多份分类文件里 —— 这是分类语义本身决定的，不是重复导出。
    """
    mapping: dict[int, list[int]] = {}
    for wallpaper_id, category_id in source_db.execute(
        "SELECT wallpaper_id, category_id FROM wallpaper_category"
    ):
        root_id = tree.get(int(category_id))
        if root_id is None:
            continue
        values = mapping.setdefault(int(wallpaper_id), [])
        if root_id not in values:
            values.append(root_id)
    for values in mapping.values():
        values.sort()
    return mapping


def _resolve_default_category(
    categories: list[tuple[int, str]],
    default_category: str | int | None,
) -> int | None:
    """把「默认分类」解析成一级分类 id。支持按名称或按 id 指定。

    指定的分类不存在（或没指定）时退回列表首项，保证索引里总有可用的默认值。
    """
    if default_category is not None:
        wanted = str(default_category).strip()
        if wanted:
            for category_id, name in categories:
                if name == wanted or str(category_id) == wanted:
                    return category_id
    return categories[0][0] if categories else None


def export_livewall_catalog(
    source: str | Path,
    output_dir: str | Path,
    *,
    device: str = "desktop",
    content: str = "dynamic",
    default_category: str | int | None = DEFAULT_CATEGORY_NAME,
) -> tuple[Path, dict[str, Path]]:
    """导出供「动态壁纸」客户端使用的壁纸清单。

    产物是「1 + N」两层，全部落在 `<output_dir>/livewall/` 下：

    - `catalog.json` —— **纯索引**：分类清单（含条目数为 0 的分类）与默认分类。
      **不含任何条目** —— 它是启动时唯一必拉的文件，因此必须很小（几百字节）。
      客户端拿到它就有菜单了。
    - `category.<一级分类 id>.json` —— 每个**有内容**的分类一份，结构沿用旧版
      `livewall.json`。客户端按选中分类单独拉取，并各自缓存。

    与 `publish_catalog` 的区别：这里**不做加密**，输出是明文 JSON，
    直接给本机客户端读取。返回 (索引路径, {分类名: 分类文件路径})。
    """
    source_path = Path(source).resolve()
    target_dir = Path(output_dir).resolve() / LIVEWALL_DIR_NAME
    target_dir.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(f"file:{source_path}?mode=ro", uri=True) as source_db:
        items = _fetch_items(source_db, device=device, content=content)
        categories = _fetch_root_categories(source_db, device=device, content=content)
        tree = _fetch_category_tree(source_db, device=device, content=content)
        roots_by_wallpaper = _fetch_wallpaper_roots(source_db, tree)

    # 回填条目的一级分类归属。**索引里没有条目**，所以不属于任何分类的条目
    # 哪儿都到不了 —— 实测线上数据里没有这种条目（每张壁纸都挂了一个一级分类）。
    for item in items:
        item["categoryIds"] = roots_by_wallpaper.get(int(item["id"]), [])

    # 分桶。条目顺序沿用全局 ORDER BY（创建时间倒序），与旧版单文件一致。
    buckets: dict[int, list[dict[str, object]]] = {category_id: [] for category_id, _ in categories}
    for item in items:
        for root_id in item["categoryIds"]:  # type: ignore[union-attr]
            bucket = buckets.get(int(root_id))
            if bucket is not None:
                bucket.append(item)

    default_id = _resolve_default_category(categories, default_category)
    # 把默认分类提到列表首位：客户端「默认选中第一个分类」于是成为纯字面实现，
    # 不需要再单独读 defaultCategoryId 就能得到正确行为。sort 是稳定的，
    # 其余分类保持 sort_order, id 的原序。
    ordered = sorted(categories, key=lambda row: row[0] != default_id)

    generated_at = datetime.now(timezone.utc).isoformat()
    category_entries: list[dict[str, object]] = []
    category_paths: dict[str, Path] = {}
    for category_id, name in ordered:
        bucket_items = buckets.get(category_id, [])
        if not bucket_items:
            # 空分类只登记不落文件：客户端拿到 items 为空的清单会判定为「解析失败」
            # 并触发降级，写出来反而是个陷阱。file 为 null 表示「没有可拉取的分类文件」。
            category_entries.append(
                {"id": category_id, "name": name, "file": None, "itemCount": 0}
            )
            continue

        file_name = category_file_name(category_id)
        category_path = target_dir / file_name
        subtree_ids = sorted(cid for cid, root_id in tree.items() if root_id == category_id)
        category_path.write_text(
            json.dumps(
                {
                    "schemaVersion": SCHEMA_VERSION,
                    "generatedAt": generated_at,
                    "source": {
                        "deviceType": device,
                        "contentType": content,
                        "categoryName": name,
                        # 该分类子树下的全部分类 id（含自身与各级子分类），便于排查
                        "categoryIds": subtree_ids,
                    },
                    "items": bucket_items,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
            + "\n",
            encoding="utf-8",
        )
        category_entries.append(
            {"id": category_id, "name": name, "file": file_name, "itemCount": len(bucket_items)}
        )
        category_paths[name] = category_path

    catalog_path = target_dir / CATALOG_FILE_NAME
    catalog_path.write_text(
        json.dumps(
            {
                "schemaVersion": SCHEMA_VERSION,
                "generatedAt": generated_at,
                "source": {"deviceType": device, "contentType": content},
                "defaultCategoryId": default_id,
                "categories": category_entries,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )

    # 清理上一轮遗留的分类文件（分类被删或改名后会留下孤儿文件）
    keep = {path.name for path in category_paths.values()}
    keep.add(CATALOG_FILE_NAME)
    for previous in target_dir.glob(f"{CATEGORY_FILE_PREFIX}*.json"):
        if previous.name not in keep:
            previous.unlink(missing_ok=True)

    return catalog_path, category_paths
