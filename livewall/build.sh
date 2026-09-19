#!/usr/bin/env bash
# 编译「动态壁纸」并组装成可双击运行的 .app 包。
#
# 为什么必须是 .app 而不是裸可执行文件：
#   1. 桌面层覆盖窗口需要完整的 NSApplication 生命周期；
#   2. LSUIElement=true 必须写在 Info.plist 里才会生效；
#   3. 裸二进制启动时窗口层级行为与打包后可能不一致。
#
# 编译交给 SwiftPM（Package.swift），本脚本只负责组装与签名。
#
# 用法：
#   ./build.sh                       构建正式 App（默认）
#   ./build.sh --product livewall  同上
#   ./build.sh --debug               用 debug 配置
#   ./build.sh --clean               先清理产物

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT/build"
CONFIGURATION="release"
PRODUCT_KEY="livewall"
CLEAN=0

usage() {
  cat <<'EOF'
用法：./build.sh [选项]

选项：
  --product livewall  构建正式 App（默认，也是唯一产品）
  --debug                     使用 debug 配置（编译更快，运行更慢）
  --clean                     先删除 build/ 与 .build/
  -h, --help                  显示本帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --product)
      PRODUCT_KEY="${2:-}"
      shift 2
      ;;
    --debug)
      CONFIGURATION="debug"
      shift
      ;;
    --clean)
      CLEAN=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "错误：未知参数 $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$PRODUCT_KEY" in
  livewall)
    # PRODUCT = SwiftPM 产品名，决定 Contents/MacOS 下的二进制文件名，
    # 必须与 Info.plist 的 CFBundleExecutable 一致 —— 改名只改 APP_NAME，不动它。
    PRODUCT="LiveWall"
    APP_NAME="LiveWall"
    PLIST="Resources/Info-LiveWall.plist"
    ;;
  *)
    echo "错误：未知产品 ${PRODUCT_KEY}（唯一可选 livewall）" >&2
    exit 2
    ;;
esac

if [[ "$CLEAN" -eq 1 ]]; then
  rm -rf "$BUILD_DIR" "$ROOT/.build"
  echo "[build] 已清理 build/ 与 .build/"
fi

if [[ ! -f "$ROOT/$PLIST" ]]; then
  echo "错误：缺少 ${PLIST}（产品 ${PRODUCT_KEY} 的 Info.plist）" >&2
  exit 1
fi

echo "[build] swift build -c $CONFIGURATION --product $PRODUCT"
cd "$ROOT"

# 用临时文件而不是管道：`swift build | grep ... || true` 会把编译失败一起吞掉，
# 而 .build/ 里可能残留上次的产物，导致静默使用过期二进制。
BUILD_LOG="$(mktemp)"
set +e
swift build -c "$CONFIGURATION" --product "$PRODUCT" >"$BUILD_LOG" 2>&1
BUILD_STATUS=$?
set -e

# 过滤 SwiftPM 在「仅安装 Command Line Tools」环境下必然出现的 ld 搜索路径警告
grep -vE "^\[[0-9]+/[0-9]+\]|^Building for|^Compiling|^Planning|ld: warning: search path" "$BUILD_LOG" || true
rm -f "$BUILD_LOG"

if [[ "$BUILD_STATUS" -ne 0 ]]; then
  echo "错误：swift build 失败（退出码 ${BUILD_STATUS}）" >&2
  exit "$BUILD_STATUS"
fi

BINARY=".build/$CONFIGURATION/$PRODUCT"
if [[ ! -x "$BINARY" ]]; then
  echo "错误：未找到编译产物 $BINARY" >&2
  exit 1
fi

APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"

cp "$ROOT/$PLIST" "$APP_BUNDLE/Contents/Info.plist"
cp "$BINARY" "$APP_BUNDLE/Contents/MacOS/$PRODUCT"

# App 图标。Info.plist 的 CFBundleIconFile 指向 AppIcon（不带扩展名）。
# 缺失时不阻断构建，只是产物没有自定义图标 —— 图标非必需。
ICON="$ROOT/Resources/AppIcon.icns"
if [[ -f "$ICON" ]]; then
  cp "$ICON" "$APP_BUNDLE/Contents/Resources/"
else
  echo "[build] 警告：缺少 Resources/AppIcon.icns，产物将没有自定义图标" >&2
fi

# 菜单栏状态项图标。AppDelegate 通过 Bundle.main.image(forResource:) 读取，
# 因此必须落在 Contents/Resources/ 下，@2x/@3x 与主文件同名才能被识别为同一张图。
# 同样允许缺失，AppDelegate 会回退到文字字形。
ICON_COUNT=0
for f in "$ROOT"/Resources/MenuBarIcon*.png; do
  [[ -f "$f" ]] || continue
  cp "$f" "$APP_BUNDLE/Contents/Resources/"
  ICON_COUNT=$((ICON_COUNT + 1))
done
if [[ "$ICON_COUNT" -eq 0 ]]; then
  echo "[build] 提示：未找到 Resources/MenuBarIcon*.png，菜单栏将使用文字字形" >&2
fi

# 本地自用：ad-hoc 签名，避免每次都被 Gatekeeper 拦
codesign --force --sign - "$APP_BUNDLE" >/dev/null 2>&1 \
  || echo "[build] 跳过签名（不影响本地运行）"

# 图标必须被封进签名才会生效（Sealed Resources 的 files 计数应 > 0）
if [[ -f "$ICON" ]] && ! codesign -dv "$APP_BUNDLE" 2>&1 | grep -q 'files=[1-9]'; then
  echo "[build] 警告：图标未被封进签名，Finder 里可能不显示" >&2
fi

echo "[build] 产物：$APP_BUNDLE"
echo "[build] 运行：./run.sh"
