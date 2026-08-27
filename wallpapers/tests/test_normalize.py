from wallpapers.models import AssetData
from wallpapers.normalize import normalize_item, normalize_url, parse_dimensions, split_tags


def test_normalize_url_and_dimensions():
    assert normalize_url("http://CDN.Example.com/a.jpg?x=1#frag") == "https://cdn.example.com/a.jpg?x=1"
    assert parse_dimensions("1440x2560") == (1440, 2560)
    assert split_tags("雨夜, 溪流，绿色") == ["雨夜", "溪流", "绿色"]


def test_dynamic_item_maps_image_and_preview_video():
    item = normalize_item(
        {
            "id": "123",
            "qid": "q1",
            "title": "雨天古镇",
            "image": "http://cdn.example.com/a.jpg",
            "file_url_10s": "http://video.example.com/a.mp4",
            "first_category": "风景",
            "second_category": "其他景观",
            "tags": "雨夜,古镇",
            "video_size": "1440x2560",
        },
        device_type="mobile",
        content_type="dynamic",
        source="test",
    )
    assert item is not None
    assert item.stable_key == "mobile-dynamic-123"
    assert [asset.media_role for asset in item.assets] == ["image", "video_preview"]
    assert item.width == 1440 and item.height == 2560
    assert ("雨夜", "tag") in item.keywords
