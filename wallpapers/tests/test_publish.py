import json
import sqlite3

from wallpapers.publish import publish_catalog


def test_publish_catalog_writes_json_catalog_and_bootstrap(tmp_path):
    source = tmp_path / "source.db"
    with sqlite3.connect(source) as db:
        db.executescript(
            """
            CREATE TABLE wallpaper (id INTEGER PRIMARY KEY, source TEXT, remote_id TEXT, remote_qid TEXT, stable_key TEXT, device_type TEXT, content_type TEXT, title TEXT, author TEXT, fee_type TEXT, price NUMERIC, resolution_raw TEXT, width INTEGER, height INTEGER, duration_seconds REAL, remote_created_at TEXT, first_seen_at TEXT, last_seen_at TEXT, updated_at TEXT, raw_json TEXT, status TEXT);
            CREATE TABLE asset (id INTEGER PRIMARY KEY, url TEXT, normalized_url TEXT, media_type TEXT, media_role TEXT, accessible INTEGER, width INTEGER, height INTEGER);
            CREATE TABLE wallpaper_asset (wallpaper_id INTEGER, asset_id INTEGER, is_primary INTEGER, sort_order INTEGER);
            CREATE TABLE category (id INTEGER PRIMARY KEY, device_type TEXT, content_type TEXT, name TEXT, level INTEGER, parent_id INTEGER, sort_order INTEGER);
            CREATE TABLE wallpaper_category (wallpaper_id INTEGER, category_id INTEGER, relation_type TEXT);
            CREATE TABLE keyword (id INTEGER PRIMARY KEY, keyword TEXT, keyword_type TEXT);
            CREATE TABLE wallpaper_keyword (wallpaper_id INTEGER, keyword_id INTEGER);
            CREATE TABLE crawl_request (id INTEGER);
            INSERT INTO wallpaper VALUES (1, 'test', '1', NULL, 'desktop-static-1', 'desktop', 'static', 'Demo', 'Author', NULL, NULL, NULL, 1920, 1080, NULL, '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01', '{"raw":true}', 'active');
            """
        )
        db.commit()

    output = tmp_path / "output"
    catalog_path, manifest_path = publish_catalog(source, output)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    assert len(catalog["items"]) == 1
    assert catalog["items"][0]["title"] == "Demo"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    bootstrap_path = output / manifest["bootstrap"]
    bootstrap = json.loads(bootstrap_path.read_text(encoding="utf-8"))
    assert len(bootstrap["items"]) == 1
    assert bootstrap["categories"] == []
    assert manifest["catalog"] == catalog_path.name
    assert manifest["catalogFileSize"] == catalog_path.stat().st_size
