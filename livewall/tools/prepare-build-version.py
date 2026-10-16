#!/usr/bin/env python3
"""在暂存 plist 上计算发布 build，兼容只有 App、没有 DMG 清单的上次发布。"""

import argparse
import json
from pathlib import Path
import plistlib
import re


def numeric_build(value):
    text = str(value)
    return int(text) if re.fullmatch(r"[0-9]+", text) else None


def prepare_version(plist_path, previous_apps, previous_feeds):
    text = plist_path.read_text(encoding="utf-8")
    current = numeric_build(plistlib.loads(text.encode("utf-8")).get("CFBundleVersion"))
    if current is None:
        raise ValueError("暂存 Info.plist 的 CFBundleVersion 不是非负整数。")
    previous = []
    for app in previous_apps:
        path = app / "Contents/Info.plist"
        if path.is_file():
            value = numeric_build(plistlib.loads(path.read_bytes()).get("CFBundleVersion"))
            if value is not None:
                previous.append(value)
    for path in previous_feeds:
        if path.is_file():
            value = numeric_build(json.loads(path.read_text(encoding="utf-8")).get("build"))
            if value is not None:
                previous.append(value)
    if not previous or current > max(previous):
        print(f"[build] CFBundleVersion：{current}（高于旧产物或尚无旧产物，保持不动）")
        return
    new_build = max(previous) + 1
    # 定点替换，保留源 plist 的缩进、键顺序及其他内容。
    updated, count = re.subn(
        r"(<key>CFBundleVersion</key>\s*<string>)\d+(</string>)",
        lambda match: match.group(1) + str(new_build) + match.group(2), text,
    )
    if count != 1:
        raise ValueError("暂存 Info.plist 必须包含恰好一处字符串 CFBundleVersion。")
    plist_path.write_text(updated, encoding="utf-8")
    print(f"[build] CFBundleVersion 自动递增：{current} → {new_build}（旧产物最大值 {max(previous)}）")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plist", type=Path, required=True)
    parser.add_argument("--previous-app", type=Path, action="append", default=[])
    parser.add_argument("--previous-feed", type=Path, action="append", default=[])
    args = parser.parse_args()
    try:
        prepare_version(args.plist, args.previous_app, args.previous_feed)
    except (OSError, ValueError, plistlib.InvalidFileException) as error:
        parser.exit(1, f"错误：无法确定发布 build 号：{error}\n")


if __name__ == "__main__":
    main()
