#!/usr/bin/env bash
set -euo pipefail

# 从固定的发布快照下载 FFmpeg，并用同一快照提供的 SHA-256 清单校验。
# Windows 使用含 libx264 的 BtbN GPL 构建；其他平台继续使用 binmgr/ffmpeg。
# 调用方必须传入不可变的 Release tag；禁止使用 latest，以保证发布可复现。

usage() {
  cat <<'EOF'
用法：scripts/fetch-ffmpeg.sh --rid <RID> --release <TAG> --output <FILE> [--source-base <URL>]

支持的 RID：win-x64、win-arm64、linux-x64、linux-arm64、osx-x64、osx-arm64
EOF
}

rid=''
release=''
output=''
source_base=''

while [ "$#" -gt 0 ]; do
  case "$1" in
    --rid) rid=${2:?}; shift 2 ;;
    --release) release=${2:?}; shift 2 ;;
    --output) output=${2:?}; shift 2 ;;
    --source-base) source_base=${2:?}; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$release" in
  ''|latest|YOUR_*|*PINNED_RELEASE*)
    echo '必须传入实际且不可变的 FFmpeg Release tag，例如 v9.0.2 或 autobuild-2026-10-11-13-04。' >&2
    usage >&2
    exit 2
    ;;
esac

if [ -z "$rid" ] || [ -z "$output" ]; then
  usage >&2
  exit 2
fi

case "$rid" in
  win-x64)
    source_base=${source_base:-'https://github.com/BtbN/FFmpeg-Builds/releases/download'}
    checksum_name='checksums.sha256'
    asset_pattern='-win64-gpl-9\.0\.zip$'
    executable='ffmpeg.exe'
    archive_type='zip'
    provider='BtbN GPL'
    ;;
  win-arm64)
    source_base=${source_base:-'https://github.com/BtbN/FFmpeg-Builds/releases/download'}
    checksum_name='checksums.sha256'
    asset_pattern='-winarm64-gpl-9\.0\.zip$'
    executable='ffmpeg.exe'
    archive_type='zip'
    provider='BtbN GPL'
    ;;
  linux-x64)
    source_base=${source_base:-'https://github.com/binmgr/ffmpeg/releases/download'}
    checksum_name='SHA256SUMS.txt'
    asset='ffmpeg-linux-amd64.tar.gz'
    executable='ffmpeg'
    archive_type='tar.gz'
    provider='binmgr'
    ;;
  linux-arm64)
    source_base=${source_base:-'https://github.com/binmgr/ffmpeg/releases/download'}
    checksum_name='SHA256SUMS.txt'
    asset='ffmpeg-linux-arm64.tar.gz'
    executable='ffmpeg'
    archive_type='tar.gz'
    provider='binmgr'
    ;;
  osx-x64)
    source_base=${source_base:-'https://github.com/binmgr/ffmpeg/releases/download'}
    checksum_name='SHA256SUMS.txt'
    asset='ffmpeg-darwin-amd64.tar.gz'
    executable='ffmpeg'
    archive_type='tar.gz'
    provider='binmgr'
    ;;
  osx-arm64)
    source_base=${source_base:-'https://github.com/binmgr/ffmpeg/releases/download'}
    checksum_name='SHA256SUMS.txt'
    asset='ffmpeg-darwin-arm64.tar.gz'
    executable='ffmpeg'
    archive_type='tar.gz'
    provider='binmgr'
    ;;
  *) echo "不支持的 RID：$rid" >&2; exit 2 ;;
esac

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/xiaomi-camera-ffmpeg.XXXXXX")
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT

checksums="$work_dir/$checksum_name"
curl --fail --location --retry 3 --output "$checksums" "$source_base/$release/$checksum_name"

if [ -n "${asset_pattern:-}" ]; then
  asset=$(awk -v pattern="$asset_pattern" '
    {
      file = $2
      sub(/^\*/, "", file)
      if (file ~ pattern) {
        print file
        exit
      }
    }' "$checksums")
  if [ -z "$asset" ]; then
    echo "SHA-256 清单中未找到适用于 $rid 的 GPL FFmpeg 资源。" >&2
    exit 1
  fi
fi

archive="$work_dir/$asset"
curl --fail --location --retry 3 --output "$archive" "$source_base/$release/$asset"

expected=$(awk -v asset="$asset" '$2 == asset || $2 == "*" asset { print $1; exit }' "$checksums")
if [ -z "$expected" ]; then
  echo "SHA256SUMS 中未找到 $asset。" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$archive" | awk '{print $1}')
else
  actual=$(shasum -a 256 "$archive" | awk '{print $1}')
fi
if [ "$actual" != "$expected" ]; then
  echo "FFmpeg 压缩包 SHA-256 校验失败。" >&2
  exit 1
fi

extract_dir="$work_dir/extract"
mkdir -p "$extract_dir"
case "$archive_type" in
  zip) unzip -q "$archive" -d "$extract_dir" ;;
  tar.gz) tar -xzf "$archive" -C "$extract_dir" ;;
esac

binary=$(find "$extract_dir" -type f -name "$executable" -print | head -n 1)
if [ -z "$binary" ]; then
  echo "压缩包内未找到 $executable。" >&2
  exit 1
fi

mkdir -p "$(dirname "$output")"
cp "$binary" "$output"
case "$rid" in
  win-*) ;;
  *) chmod 755 "$output" ;;
esac

cat >"$(dirname "$output")/SOURCE.txt" <<EOF
FFmpeg asset: $asset
Release: $release
Source: $source_base/$release/$asset
Provider: $provider
SHA-256: $expected
Binary SHA-256: $(if command -v sha256sum >/dev/null 2>&1; then sha256sum "$output" | awk '{print $1}'; else shasum -a 256 "$output" | awk '{print $1}'; fi)
EOF

if [ "$provider" = 'BtbN GPL' ]; then
  cat >>"$(dirname "$output")/SOURCE.txt" <<'EOF'
License: GPL-3.0-or-later (FFmpeg build includes libx264)
Build source: https://github.com/BtbN/FFmpeg-Builds
EOF
fi

echo "已准备 $rid 的 FFmpeg：$output"
