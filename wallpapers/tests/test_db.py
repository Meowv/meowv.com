from wallpapers.db import Database
from wallpapers.models import AssetData, CategoryData, WallpaperData


def make_item() -> WallpaperData:
    return WallpaperData(
        stable_key="desktop-dynamic-1",
        source="test",
        device_type="desktop",
        content_type="dynamic",
        remote_id="1",
        title="测试壁纸",
        categories=[CategoryData("风景"), CategoryData("山水", 2, "风景")],
        keywords=[("溪流", "tag")],
        assets=[
            AssetData("http://cdn.example.com/a.jpg", "image", "image"),
            AssetData("http://cdn.example.com/a.mp4", "video", "video_preview"),
        ],
    )


def test_schema_and_idempotent_upsert(tmp_path):
    with Database(tmp_path / "test.db") as db:
        run_id = db.begin_run()
        request_id = db.add_request(run_id, "category", "https://example.test/list")
        db.upsert_item(make_item(), request_id, ["雨夜"])
        db.upsert_item(make_item(), request_id, ["雨夜"])
        assert db.conn.execute("SELECT COUNT(*) FROM wallpaper").fetchone()[0] == 1
        assert db.conn.execute("SELECT COUNT(*) FROM asset").fetchone()[0] == 2
        assert db.conn.execute("SELECT COUNT(*) FROM category").fetchone()[0] == 2
        assert db.conn.execute("SELECT COUNT(*) FROM keyword").fetchone()[0] == 2
        columns = {row[1] for row in db.conn.execute("PRAGMA table_info(wallpaper)")}
        assert {"status", "last_seen_run_id", "missing_count"} <= columns


def test_full_reconcile_marks_missing_then_inactive(tmp_path):
    with Database(tmp_path / "reconcile.db") as db:
        first_run = db.begin_run("full")
        request_id = db.add_request(first_run, "category", "https://example.test/list")
        db.upsert_item(make_item(), request_id, run_id=first_run)
        assert db.reconcile_full_run(first_run, "test", "desktop", "dynamic") == 0

        second_run = db.begin_run("full")
        assert db.reconcile_full_run(second_run, "test", "desktop", "dynamic") == 1
        assert db.conn.execute("SELECT status FROM wallpaper").fetchone()[0] == "missing"

        third_run = db.begin_run("full")
        assert db.reconcile_full_run(third_run, "test", "desktop", "dynamic") == 1
        assert db.conn.execute("SELECT status FROM wallpaper").fetchone()[0] == "inactive"
