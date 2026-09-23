from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1

# 播放地址只导出 video_preview：当前公开接口对「电脑动态」只提供 video_preview，
# 没有 video_original，因此这是唯一可用的播放地址。
VIDEO_ROLE = "video_preview"

# 静态图（`media_role='image'`）。它**不在播放链路上**，只给客户端的「锁屏预览」
# 与「下载当前壁纸」用 —— 客户端拿它设系统墙纸，锁屏时就能看到当前这张。
# 每张壁纸入库时都强制带 image（见 `normalize.normalize_item`：拿不到 image 的
# 整条记录会被丢弃），但它的 `accessible` **不是真实探测结果**（`pipeline` 从不做
# HEAD，走列默认值 1），所以客户端必须能容忍这个地址 404 并自行降级。
IMAGE_ROLE = "image"

# 与 publish.py 一致：每个壁纸最多保留 4 个标签
MAX_TAGS = 4

# 供 livewall 客户端使用的清单目录。索引与各分类文件都放在这个子目录下：
#   <output_dir>/livewall/catalog.json                索引（分类清单 + 默认分类，不含条目）
#   <output_dir>/livewall/all.json                   去重后的全部条目
#   <output_dir>/livewall/category.<一级分类 id>.json  各分类的条目切片
# 放子目录有两个原因：一是与 Studio 的 wallpapers.catalog.* 分开 ——
# encrypt-wallpaper.mjs 要求该目录下「恰好 5 个」wallpapers.catalog.*.json，
# 多出来的文件会让它直接报错；二是发布时可以整目录拷贝。
LIVEWALL_DIR_NAME = "livewall"
CATALOG_FILE_NAME = "catalog.json"
CATEGORY_FILE_PREFIX = "category."
ALL_FILE_NAME = "all.json"

# 索引的签名文件后缀（`catalog.json` → `catalog.json.sig`）。
# **这个值在三处必须一致**：这里、`livewall/Sources/LiveWallCore/UpdateSignature.swift`
# 的 `documentExtension`、根 `build.sh` 里调用签名工具的那一段。
# 本模块**不产出**它（要用本机离线私钥签），只负责在重写索引时把上一轮留下的旧签名
# 删掉 —— 见 `export_livewall_catalog` 结尾的说明。
CATALOG_SIGNATURE_SUFFIX = ".sig"

# 默认分类。与旧版 `export-livewall --category 美女` 的默认值保持一致 ——
# 该分类是当前唯一抓满内容的分类。
DEFAULT_CATEGORY_NAME = "美女"


def category_file_name(category_id: int) -> str:
    """分类文件名。用**数字 id** 而不是分类名：中文名进 URL 会触发百分号编码，
    CDN / nginx 侧行为不可控。"""
    return f"{CATEGORY_FILE_PREFIX}{category_id}.json"


def _sha256_hex(data: bytes) -> str:
    """切片文件的 sha256（小写十六进制），与客户端 `SHA256Hex` 同一口径。

    摘要算在**即将写盘的那串字节**上（含尾随换行），不是算在「JSON 对象」上 ——
    客户端校验的是收到的原始字节，两边必须逐字节一致。所以这里先 `encode` 再同时
    用于写盘与算摘要，避免「写盘时被编码器改一下」这种缝。
    """
    return hashlib.sha256(data).hexdigest()


def _fetch_items(
    source_db: sqlite3.Connection,
    *,
    device: str,
    content: str,
) -> list[dict[str, object]]:
    """查询目标壁纸的播放地址与静态图地址。

    **刻意不带分类过滤**：分类切分在 Python 侧做，这样无论有多少个分类，
    数据库只扫一遍。`categoryIds` 留空，由 `export_livewall_catalog` 回填。

    一次查询同时取两种角色（`video_preview` / `image`），各自按**同一个
    ORDER BY** 取第一个命中的那一条 —— 顺序语义由 `is_primary`、`sort_order`、
    `a.id` 共同决定，不能改成 `GROUP BY` + 聚合：那会丢掉这套语义。
    """
    rows = source_db.execute(
        f"""
        SELECT w.id, w.title, w.author, a.url, a.media_role
          FROM wallpaper AS w
          JOIN wallpaper_asset AS wa ON wa.wallpaper_id = w.id
          JOIN asset AS a ON a.id = wa.asset_id
         WHERE w.status = 'active'
           AND w.device_type = ?
           AND w.content_type = ?
           AND a.media_role IN (?, ?)
           AND a.accessible = 1
           AND a.url IS NOT NULL
           AND a.url <> ''
         ORDER BY COALESCE(w.remote_created_at, w.first_seen_at) DESC,
                  w.id DESC,
                  COALESCE(wa.is_primary, 0) DESC,
                  COALESCE(wa.sort_order, 999999) ASC,
                  a.id ASC
        """,
        (device, content, VIDEO_ROLE, IMAGE_ROLE),
    ).fetchall()

    tags = _fetch_tags(source_db)

    video_urls: dict[int, str] = {}
    cover_urls: dict[int, str] = {}
    meta: dict[int, tuple[str, str]] = {}
    # 条目顺序 = 首次出现 video_preview 的顺序，等价于原来的 `seen` 去重
    order: list[int] = []

    for row in rows:
        wallpaper_id = int(row[0])
        role = str(row[4])
        url = str(row[3])
        meta.setdefault(wallpaper_id, (row[1] or "", row[2] or ""))
        if role == VIDEO_ROLE:
            # 同一壁纸可能有多个 video_preview 资源，按 ORDER BY 取第一个即可
            if wallpaper_id not in video_urls:
                video_urls[wallpaper_id] = url
                order.append(wallpaper_id)
        else:
            # 静态图。缺失时保持 None —— 客户端会退回「抓当前帧」，
            # 不要在这里伪造一个地址。
            cover_urls.setdefault(wallpaper_id, url)

    items: list[dict[str, object]] = []
    for wallpaper_id in order:
        title, author = meta[wallpaper_id]
        items.append(
            {
                "id": wallpaper_id,
                "title": title,
                "author": author,
                "url": video_urls[wallpaper_id],
                # 静态图地址（锁屏预览与手动下载用）。可能是 null：
                # 只有 image、没有 video_preview 的壁纸不会进清单，
                # 而 image 缺失的壁纸（理论上不该有）在这里如实写 null。
                "coverUrl": cover_urls.get(wallpaper_id),
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

    产物是「索引 + 全部切片 + N 个分类切片」，全部落在 `<output_dir>/livewall/` 下：

    - `catalog.json` —— **纯索引**：分类清单（含条目数为 0 的分类）、默认分类与全部切片摘要。
      **不含任何条目** —— 它是启动时唯一必拉的文件，因此必须很小（几百字节）。
      客户端拿到它就有菜单了。每个有内容的分类条目带一个 `sha256`（**该分类切片
      文件的字节摘要**），客户端据此校验切片完整性。
    - `all.json` —— 全部条目按壁纸 id 去重，按全局顺序写入；
    - `category.<一级分类 id>.json` —— 每个**有内容**的分类一份，结构沿用旧版
      `livewall.json`。客户端只拉当前筛选的一份切片。
    - `catalog.json.sig` —— **不在这里产出**。它要用本机离线私钥签，由根
      `build.sh` 在导出之后调用 `livewall/tools/sign-version.swift` 生成。

    签的是索引的**原始字节**，所以切片摘要必须与写盘字节逐字节对应（见
    `_sha256_hex` 的说明）。

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
    all_items = [item for item in items if item["categoryIds"]]

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
            # 没有文件就没有 sha256 —— 客户端只在 file 非 null 时才要求摘要。
            category_entries.append(
                {"id": category_id, "name": name, "file": None, "itemCount": 0}
            )
            continue

        file_name = category_file_name(category_id)
        category_path = target_dir / file_name
        subtree_ids = sorted(cid for cid, root_id in tree.items() if root_id == category_id)
        # 先拼成 bytes 再写盘：**写出去的那串字节与算摘要的那串必须是同一个对象**，
        # 否则「摘要对得上、文件却不一样」这种缝迟早会出现（例如某天给 write_text
        # 加了别的编码参数）。
        payload = (
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
            + "\n"
        ).encode("utf-8")
        category_path.write_bytes(payload)
        category_entries.append(
            {
                "id": category_id,
                "name": name,
                "file": file_name,
                "itemCount": len(bucket_items),
                # **切片摘要写进索引**：客户端因此只需验一次索引的签名（多一个
                # `catalog.json.sig` 请求），各切片的完整性由「签名索引里的摘要」
                # 传递性地保证 —— 不必给每个切片各配一个签名文件、多打十次请求。
                "sha256": _sha256_hex(payload),
            }
        )
        category_paths[name] = category_path

    # 「全部」保留全局条目顺序，每个壁纸 id 只出现一次（分类之间可能共享壁纸）。
    all_entry: dict[str, object] | None = None
    all_path = target_dir / ALL_FILE_NAME
    if all_items:
        all_payload = (
            json.dumps(
                {
                    "schemaVersion": SCHEMA_VERSION,
                    "generatedAt": generated_at,
                    "source": {
                        "deviceType": device,
                        "contentType": content,
                        "categoryName": "全部",
                        "categoryIds": [category_id for category_id, _ in ordered],
                    },
                    "items": all_items,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
            + "\n"
        ).encode("utf-8")
        all_path.write_bytes(all_payload)
        all_entry = {
            "file": ALL_FILE_NAME,
            "itemCount": len(all_items),
            "sha256": _sha256_hex(all_payload),
        }
    else:
        all_path.unlink(missing_ok=True)

    # 索引自身的完整性由**外部签名**保证（`catalog.json.sig`，由根 `build.sh` 调
    # `livewall/tools/sign-version.swift` 用本机离线私钥签）—— 所以这里刻意**不写**
    # 自指的 sha256 字段：签名覆盖的已经是这个文件的原始字节，再写一个自己的摘要是多余的。
    catalog_path = target_dir / CATALOG_FILE_NAME
    # **先删掉上一轮的签名**：签名覆盖的是索引的原始字节，索引一重写它就必然失效。
    # 留着它的后果比「没有签名」糟得多 —— 新索引配旧签名，客户端报「签名与清单不符」，
    # 而人只会去怀疑密钥或密码学；删掉之后最坏是「缺签名」，症状直指发布流程漏了一步。
    # 新签名由根 `build.sh` 在导出之后立刻签出（见 `livewall/tools/sign-version.swift`）。
    (target_dir / (CATALOG_FILE_NAME + CATALOG_SIGNATURE_SUFFIX)).unlink(missing_ok=True)
    catalog_path.write_text(
        json.dumps(
            {
                "schemaVersion": SCHEMA_VERSION,
                "generatedAt": generated_at,
                "source": {"deviceType": device, "contentType": content},
                "defaultCategoryId": default_id,
                "allSlice": all_entry,
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
    if all_entry is not None:
        keep.add(ALL_FILE_NAME)
    for previous in target_dir.glob(f"{CATEGORY_FILE_PREFIX}*.json"):
        if previous.name not in keep:
            previous.unlink(missing_ok=True)

    # 对账：把刚写出的**文件字节**重新读回来再算一遍，与写进索引的摘要逐条比对。
    # 摘要是「写盘前那块 buffer」算的、客户端校验的是「收到的字节」，两者一旦分家
    # （改编码、加尾随换行、加一层压缩/格式化），表现是**客户端所有切片都判完整性失败** ——
    # 症状离原因很远，会先去怀疑网络或 CDN。所以这里在写盘后立刻回读一次，
    # 把这类错误挡在签名与发布之前。
    mismatched: list[str] = []
    for entry in category_entries:
        file_name = entry.get("file")
        if file_name is None:
            continue
        actual = _sha256_hex((target_dir / str(file_name)).read_bytes())
        if actual != entry["sha256"]:
            mismatched.append(f"{file_name}：索引记 {entry['sha256']}，文件实际 {actual}")
    if all_entry is not None:
        actual = _sha256_hex(all_path.read_bytes())
        if actual != all_entry["sha256"]:
            mismatched.append(f"{ALL_FILE_NAME}：索引记 {all_entry['sha256']}，文件实际 {actual}")
    if mismatched:
        raise RuntimeError(
            "索引里的切片摘要与写出的文件不一致，已中止"
            "（否则会产出一份客户端必然判失败的清单）：\n  " + "\n  ".join(mismatched)
        )

    return catalog_path, category_paths
