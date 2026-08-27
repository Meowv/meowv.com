from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Iterable

from .config import DEFAULT_PAGE_SIZE
from .db import Database
from .normalize import normalize_item
from .sources.base import HttpClient, SourceError
from .sources.desktop import DesktopSource
from .sources.manifest import ManifestSource
from .sources.mobile import MobileSource


@dataclass
class CrawlSummary:
    run_id: int
    requests: int = 0
    items: int = 0
    errors: int = 0


class Crawler:
    def __init__(self, db: Database, *, client: HttpClient | None = None) -> None:
        self.db = db
        self.client = client

    def crawl(
        self,
        *,
        devices: Iterable[str] = ("desktop", "mobile"),
        contents: Iterable[str] = ("dynamic", "static"),
        categories: Iterable[str] = (),
        keywords: Iterable[str] = (),
        page_size: int = DEFAULT_PAGE_SIZE,
        max_pages: int | None = None,
        refresh: bool = False,
        mode: str = "incremental",
    ) -> CrawlSummary:
        if mode not in {"quick", "incremental", "full"}:
            raise ValueError(f"不支持的抓取模式: {mode}")
        if refresh:
            mode = "full"
        run_id = self.db.begin_run(mode)
        summary = CrawlSummary(run_id)
        category_filter = {value.strip() for value in categories if value.strip()}
        keyword_values = [value.strip() for value in keywords if value.strip()]
        complete_scope = not category_filter and not keyword_values and max_pages is None
        try:
            for device_type in devices:
                for content_type in contents:
                    if device_type not in {"desktop", "mobile"} or content_type not in {"dynamic", "static"}:
                        continue
                    try:
                        combo_success = self._crawl_combo(
                            summary,
                            device_type=device_type,
                            content_type=content_type,
                            category_filter=category_filter,
                            keywords=keyword_values,
                            page_size=page_size,
                            max_pages=max_pages,
                            mode=mode,
                        )
                        if mode == "full" and complete_scope and combo_success:
                            self.db.reconcile_full_run(
                                summary.run_id,
                                f"shanhutech-{device_type}-{content_type}",
                                device_type,
                                content_type,
                            )
                    except SourceError as exc:
                        summary.errors += 1
                        if content_type == "static":
                            self._fallback_manifest(summary, device_type, content_type, str(exc))
            self.db.finish_run(
                run_id,
                "partial" if summary.errors else "success",
                total_requests=summary.requests,
                total_items=summary.items,
            )
        except Exception as exc:
            self.db.finish_run(
                run_id,
                "failed",
                str(exc),
                total_requests=summary.requests,
                total_items=summary.items,
            )
            raise
        return summary

    def _source(self, device_type: str, content_type: str):
        client = self.client or HttpClient()
        return DesktopSource(client) if device_type == "desktop" else MobileSource(client)

    def _crawl_combo(
        self,
        summary: CrawlSummary,
        *,
        device_type: str,
        content_type: str,
        category_filter: set[str],
        keywords: list[str],
        page_size: int,
        max_pages: int | None,
        mode: str,
    ) -> bool:
        source = self._source(device_type, content_type)
        category_rows, endpoint, raw = source.categories(content_type)
        category_request_id = self.db.add_request(
            summary.run_id,
            "category",
            endpoint,
            device_type=device_type,
            content_type=content_type,
            response_json=raw,
        )
        summary.requests += 1
        del category_request_id

        categories = self._category_rows(category_rows, device_type, content_type)
        if category_filter:
            categories = [row for row in categories if row["name"] in category_filter]

        if keywords:
            success = True
            for keyword in keywords:
                success = self._crawl_pages(
                    summary,
                    source,
                    device_type=device_type,
                    content_type=content_type,
                    category=None,
                    keyword=keyword,
                    page_size=page_size,
                    max_pages=max_pages,
                    mode=mode,
                ) and success
            return success

        if not categories and device_type == "desktop" and content_type == "static":
            return self._crawl_pages(
                summary,
                source,
                device_type=device_type,
                content_type=content_type,
                category=None,
                keyword=None,
                page_size=page_size,
                max_pages=max_pages,
                mode=mode,
            )
        if not categories:
            return False

        success = True
        for category in categories:
            success = self._crawl_pages(
                summary,
                source,
                device_type=device_type,
                content_type=content_type,
                category=category,
                keyword=None,
                page_size=page_size,
                max_pages=max_pages,
                mode=mode,
            ) and success
        return success

    @staticmethod
    def _category_rows(rows: list[dict], device_type: str, content_type: str) -> list[dict]:
        result: list[dict] = []
        for row in rows:
            name = str(row.get("category") or row.get("show_name") or "").strip()
            if not name:
                continue
            remote_key = str(row.get("old_id") or row.get("category") or name).strip()
            result.append({"name": name, "remote_key": remote_key, "device_type": device_type, "content_type": content_type})
        return result

    def _crawl_pages(
        self,
        summary: CrawlSummary,
        source: DesktopSource | MobileSource,
        *,
        device_type: str,
        content_type: str,
        category: dict | None,
        keyword: str | None,
        page_size: int,
        max_pages: int | None,
        mode: str,
    ) -> bool:
        source_name = f"shanhutech-{device_type}-{content_type}"
        scope_type = "search" if keyword else ("newest" if category is None else "category")
        scope_key = keyword or (category or {}).get("remote_key") or (category or {}).get("name") or "newest"
        cursor = self.db.get_cursor(source_name, device_type, content_type, scope_type, scope_key)
        page = 1
        first_page_hash: str | None = None
        latest_remote_created_at: str | None = None
        latest_remote_id: str | None = None
        safe_to_advance_cursor = False
        while True:
            try:
                page_result = source.page(
                    content_type=content_type,
                    category=(category or {}).get("remote_key") or (category or {}).get("name"),
                    keyword=keyword,
                    page=page,
                    page_size=page_size,
                )
                request_id = self.db.add_request(
                    summary.run_id,
                    scope_type,
                    page_result.endpoint,
                    device_type=device_type,
                    content_type=content_type,
                    search_keyword=keyword,
                    page=page,
                    page_size=page_size,
                    response_json=page_result.raw_json,
                )
                summary.requests += 1
                normalized_items = []
                known_before: list[bool] = []
                for raw_item in page_result.items:
                    enriched = dict(raw_item)
                    if category:
                        enriched.setdefault("first_category", category["name"])
                    item = normalize_item(
                        enriched,
                        device_type=device_type,
                        content_type=content_type,
                        source=source_name,
                    )
                    if item is None:
                        continue
                    normalized_items.append(item)
                    known_before.append(self.db.wallpaper_exists(item.stable_key))

                if page == 1:
                    first_page_hash = hashlib.sha256(
                        "\n".join(item.stable_key for item in normalized_items).encode("utf-8")
                    ).hexdigest()
                    if normalized_items:
                        latest_remote_created_at = normalized_items[0].remote_created_at
                        latest_remote_id = normalized_items[0].remote_id

                for item in normalized_items:
                    self.db.upsert_item(
                        item,
                        request_id,
                        [keyword] if keyword else [],
                        run_id=summary.run_id,
                    )
                    summary.items += 1

                reached_known_boundary = False
                if mode == "incremental" and cursor is not None and normalized_items and all(known_before):
                    watermark = cursor["last_remote_created_at"]
                    has_newer_item = bool(
                        watermark
                        and any(
                            item.remote_created_at and item.remote_created_at > watermark
                            for item in normalized_items
                        )
                    )
                    reached_known_boundary = not has_newer_item

                if page >= page_result.total_pages or not page_result.items:
                    safe_to_advance_cursor = True
                    break
                if reached_known_boundary:
                    safe_to_advance_cursor = True
                    break
                if mode == "quick":
                    break
                if max_pages is not None and page >= max_pages:
                    break
                page += 1
            except SourceError as exc:
                summary.errors += 1
                endpoint = getattr(locals().get("page_result"), "endpoint", "unknown")
                self.db.add_request(
                    summary.run_id,
                    scope_type,
                    endpoint,
                    device_type=device_type,
                    content_type=content_type,
                    search_keyword=keyword,
                    page=page,
                    page_size=page_size,
                    error_message=str(exc),
                )
                return False

        if mode != "quick" and safe_to_advance_cursor:
            self.db.update_cursor(
                source=source_name,
                device_type=device_type,
                content_type=content_type,
                scope_type=scope_type,
                scope_key=scope_key,
                last_remote_created_at=latest_remote_created_at,
                last_remote_id=latest_remote_id,
                last_page_hash=first_page_hash,
            )
        return True

    def _fallback_manifest(self, summary: CrawlSummary, device_type: str, content_type: str, reason: str) -> None:
        if device_type != "desktop" or content_type != "static":
            return
        manifest = ManifestSource(self.client or HttpClient())
        try:
            urls, endpoint, raw = manifest.wallpapers()
        except SourceError:
            return
        request_id = self.db.add_request(
            summary.run_id, "fallback", endpoint, device_type=device_type, content_type=content_type,
            response_json=raw, error_message=reason,
        )
        summary.requests += 1
        for url in urls:
            item = normalize_item(
                {"url": url, "title": url.rsplit("/", 1)[-1]},
                device_type=device_type,
                content_type=content_type,
                source="ios-25pan-manifest",
            )
            if item:
                self.db.upsert_item(item, request_id, run_id=summary.run_id)
                summary.items += 1
