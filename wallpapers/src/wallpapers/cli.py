from __future__ import annotations

import argparse
import mimetypes
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import DEFAULT_PAGE_SIZE
from .db import Database
from .export import DEFAULT_CATEGORY_NAME, export_livewall_catalog
from .pipeline import Crawler
from .publish import publish_catalog


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="采集公开壁纸接口中的元数据和 CDN 地址")
    parser.add_argument("--db", default="wallpapers.db", help="SQLite 数据库路径")
    sub = parser.add_subparsers(dest="command", required=True)

    crawl = sub.add_parser("crawl", help="抓取壁纸元数据和媒体地址")
    crawl.add_argument("--db", default=argparse.SUPPRESS, help="SQLite 数据库路径")
    crawl.add_argument("--device", choices=("desktop", "mobile", "all"), default="all")
    crawl.add_argument("--content", choices=("static", "dynamic", "all"), default="all")
    crawl.add_argument(
        "--mode",
        choices=("quick", "incremental", "full"),
        default="incremental",
        help="抓取模式，默认 incremental",
    )
    crawl.add_argument("--category", action="append", default=[])
    crawl.add_argument("--keyword", action="append", default=[])
    crawl.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE)
    crawl.add_argument("--max-pages", type=int)
    crawl.add_argument("--refresh", action="store_true", help="兼容参数，等同于 --mode full")

    stats = sub.add_parser("stats", help="查看数据库统计")
    stats.add_argument("--db", default=argparse.SUPPRESS, help="SQLite 数据库路径")
    check = sub.add_parser("check", help="检查已保存 CDN 地址")
    check.add_argument("--db", default=argparse.SUPPRESS, help="SQLite 数据库路径")
    publish = sub.add_parser("publish", help="生成供 Studio 前端使用的 JSON 发布目录")
    publish.add_argument("--db", default=argparse.SUPPRESS, help="源 SQLite 数据库路径")
    publish.add_argument(
        "--output-dir",
        default="../studio/public/data",
        help="发布库输出目录，默认 ../studio/public/data",
    )

    export = sub.add_parser(
        "export-livewall", help="导出供「动态壁纸」客户端使用的明文清单目录（索引 + 全部 / 分类切片）"
    )
    export.add_argument("--db", default=argparse.SUPPRESS, help="源 SQLite 数据库路径")
    export.add_argument(
        "--output-dir",
        default="../studio/public/data",
        help="输出目录，索引与分类切片写入其下的 livewall/ 子目录，默认 ../studio/public/data",
    )
    export.add_argument("--device", choices=("desktop", "mobile"), default="desktop")
    export.add_argument("--content", choices=("static", "dynamic"), default="dynamic")
    export.add_argument(
        "--default-category",
        default=DEFAULT_CATEGORY_NAME,
        help=(
            "默认分类，可填分类名称或分类 id；该分类会被排在索引的 categories 首位，"
            f"默认 {DEFAULT_CATEGORY_NAME}"
        ),
    )
    return parser


def _check_assets(db: Database) -> int:
    checked = 0
    for row in db.asset_rows():
        status = 0
        mime = mimetypes.guess_type(row[1])[0]
        accessible = False
        try:
            request = Request(row[1], method="HEAD", headers={"User-Agent": "wallpapers-crawler/0.1"})
            with urlopen(request, timeout=15) as response:
                status = int(getattr(response, "status", 200))
                mime = response.headers.get_content_type() or mime
                accessible = status < 400
        except (HTTPError, URLError, TimeoutError):
            accessible = False
        db.update_asset_check(int(row[0]), status, accessible, mime)
        checked += 1
    return checked


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    db_path = Path(args.db)

    # 导出分支放在 Database 上下文之外：Database() 会在文件缺失时创建空库，
    # 那样导出会静默产出 0 条而不是报错。
    if args.command == "export-livewall":
        if not db_path.exists():
            print(f"错误：数据库不存在：{db_path}", file=sys.stderr)
            return 2
        catalog_path, category_paths = export_livewall_catalog(
            db_path,
            args.output_dir,
            device=args.device,
            content=args.content,
            default_category=args.default_category,
        )
        print(f"catalog={catalog_path}")
        all_path = Path(args.output_dir).resolve() / "livewall" / "all.json"
        if all_path.exists():
            print(f"all={all_path}")
        for name, path in category_paths.items():
            print(f"category={name}:{path}")
        # 索引里的分类总数可能多于文件数（0 条分类不落片）；all.json 单独计入 slices。
        print(f"slices={len(category_paths) + int(all_path.exists())}")
        return 0

    with Database(db_path) as db:
        if args.command == "crawl":
            devices = ("desktop", "mobile") if args.device == "all" else (args.device,)
            contents = ("dynamic", "static") if args.content == "all" else (args.content,)
            summary = Crawler(db).crawl(
                devices=devices,
                contents=contents,
                categories=args.category,
                keywords=args.keyword,
                page_size=max(1, args.page_size),
                max_pages=args.max_pages,
                refresh=args.refresh,
                mode=args.mode,
            )
            mode = "full" if args.refresh else args.mode
            print(
                f"run_id={summary.run_id} mode={mode} requests={summary.requests} "
                f"items={summary.items} errors={summary.errors}"
            )
            return 0 if summary.errors == 0 else 2
        if args.command == "stats":
            for row in db.stats():
                print(f"{row['device_type']}\t{row['content_type']}\t{row['count']}")
            return 0
        if args.command == "publish":
            catalog_paths, manifest_path = publish_catalog(db_path, args.output_dir)
            print(f"catalogs={','.join(f'{bucket}:{path}' for bucket, path in catalog_paths.items())}")
            print(f"manifest={manifest_path}")
            return 0
        checked = _check_assets(db)
        print(f"checked={checked}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
