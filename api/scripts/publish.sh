#!/usr/bin/env bash
set -euo pipefail

# 发布为自包含单文件主程序，FFmpeg 与主程序放在同一 RID 目录并复用校验结果。
default_ffmpeg_release='v9.0.2'
# Windows 使用包含 libx264 的 GPL 构建；该 tag 是 BtbN 发布的不可变快照。
default_windows_ffmpeg_release='autobuild-2026-10-11-13-04'

usage() {
  cat <<'EOF'
用法：scripts/publish.sh --rid <RID> [--ffmpeg-release <TAG>] [--output <DIR>] [--source-base <URL>] [--without-ffmpeg]

--output 指定构建根目录，默认是项目中的 build/。应用产物位于 <DIR>/<RID>/，
主程序为 Meowv.Api（Windows 为 Meowv.Api.exe），无需单独分发 .NET DLL。
appsettings.json 作为公共配置放在主程序旁，开发配置和数据库不发布。
默认启用代码裁剪和单文件压缩。仅部署非摄像头模块时可用 --without-ffmpeg 跳过工具准备。
FFmpeg 和来源校验记录 SOURCE.txt 直接放在 <DIR>/<RID>/，整个目录即可独立分发。
未传 --ffmpeg-release 时，Windows 使用固定的 BtbN GPL 快照，其他平台使用固定版本 v9.0.2。

示例：scripts/publish.sh --rid osx-arm64
EOF
}

include_ffmpeg=1
rid=''
release=''
output=''
source_base=''

while [ "$#" -gt 0 ]; do
  case "$1" in
    --without-ffmpeg) include_ffmpeg=0; shift ;;
    --rid) rid=${2:?}; shift 2 ;;
    --ffmpeg-release) release=${2:?}; shift 2 ;;
    --output) output=${2:?}; shift 2 ;;
    --source-base) source_base=${2:?}; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$release" in
  latest|YOUR_*|*PINNED_RELEASE*)
    echo '必须传入实际且不可变的 FFmpeg Release tag，例如 v9.0.2 或 autobuild-2026-10-11-13-04。' >&2
    usage >&2
    exit 2
    ;;
esac

if [ -z "$rid" ]; then
  usage >&2
  exit 2
fi

case "$rid" in
  win-x64|win-arm64|linux-x64|linux-arm64|osx-x64|osx-arm64) ;;
  *) echo "不支持的 RID：$rid" >&2; exit 2 ;;
esac

case "$rid" in
  win-*) release=${release:-$default_windows_ffmpeg_release} ;;
  *) release=${release:-$default_ffmpeg_release} ;;
esac

script_dir=$(cd "$(dirname "$0")" && pwd)
project_dir=$(cd "$script_dir/.." && pwd)
build_dir=${output:-"$project_dir/build"}
publish_dir="$build_dir/$rid"
executable='ffmpeg'
case "$rid" in
  win-*) executable='ffmpeg.exe' ;;
esac

dotnet publish "$project_dir/src/Meowv.Api/Meowv.Api.csproj" \
  --configuration Release \
  --runtime "$rid" \
  --self-contained true \
  -p:PublishSingleFile=true \
  -p:PublishTrimmed=true \
  -p:TrimMode=full \
  -p:EnableCompressionInSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true \
  -p:DebugType=embedded \
  -p:IsTransformWebConfigDisabled=true \
  --output "$publish_dir"

if [ "$include_ffmpeg" -eq 0 ]; then
  echo "发布完成：${publish_dir}（未准备 FFmpeg）"
  exit 0
fi

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

cached_binary="$publish_dir/$executable"
cached_source="$publish_dir/SOURCE.txt"
cached_release=''
cached_hash=''
if [ -f "$cached_source" ]; then
  cached_release=$(sed -n 's/^Release: //p' "$cached_source" | head -n 1)
  cached_hash=$(sed -n 's/^Binary SHA-256: //p' "$cached_source" | head -n 1)
fi

if [ -f "$cached_binary" ] && [ "$cached_release" = "$release" ] && [ -n "$cached_hash" ] && [ "$(sha256 "$cached_binary")" = "$cached_hash" ]; then
  echo "复用已校验的 $rid FFmpeg 缓存：$cached_binary"
else
  fetch_args=(--rid "$rid" --release "$release" --output "$cached_binary")
  if [ -n "$source_base" ]; then
    fetch_args+=(--source-base "$source_base")
  fi
  bash "$script_dir/fetch-ffmpeg.sh" "${fetch_args[@]}"
fi

echo "发布完成：$publish_dir"
echo "FFmpeg：$cached_binary"
