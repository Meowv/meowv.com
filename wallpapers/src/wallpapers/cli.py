from __future__ import annotations

import argparse
import mimetypes
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import DEFAULT_PAGE_SIZE
from .db import Database
from .pipeline import Crawler


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
        checked = _check_assets(db)
        print(f"checked={checked}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
