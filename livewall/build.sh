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

# Info.plist 的 CFBundleExecutable 必须与实际拷进 Contents/MacOS 的文件名一致 ——
# 不一致时 App 双击后立刻退出（系统找不到可执行文件），而构建本身是「成功」的。
# 这个约定此前只写在注释里靠人遵守，这里加一道硬校验。
PLIST_EXECUTABLE="$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$ROOT/$PLIST" 2>/dev/null || echo "")"
if [[ "$PLIST_EXECUTABLE" != "$PRODUCT" ]]; then
  echo "错误：Info.plist 的 CFBundleExecutable 是「${PLIST_EXECUTABLE}」，与产品名「${PRODUCT}」不一致。" >&2
  echo "      两者必须相同，否则 App 双击后会被系统判为「找不到可执行文件」而立即退出。" >&2
  exit 1
fi

# ── build 号自动递增 ────────────────────────────────────
# 客户端**只认 `CFBundleVersion`**（`UpdateEvaluator` 判 `feed.build > localBuild`）。
# 忘了递增的后果是「发出去的包用户永远看不到更新提示」，而症状与「线上没发新版」
# 完全一样，排障会往完全错误的方向走 —— 2026-09-22 就漏过一次。
#
# 但这个值**不需要人决定**：上次的 build 号就在参照物里，加一即可。手改是纯粹的重复
# 劳动，而且手改本身就是出错来源。所以这里自动递增并写回源 plist。
# 想手动指定更大跨度（比如直接跳到 10）时把 plist 改大即可 —— 只要大于参照物就不动它。
#
# ⚠️ 必须在组装 .app 与 codesign **之前**做：包内的 Info.plist 一旦改过，已有签名即失效。
# 参照物优先取「上次已装进 studio 部署目录的那一份」（最接近线上），其次取本地产物。
REPO_ROOT="$(cd "${ROOT}/.." && pwd)"
PLIST_PATH="${ROOT}/${PLIST}"
CURRENT_BUILD="$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "${PLIST_PATH}" 2>/dev/null || echo "")"
PREVIOUS_FEED="${REPO_ROOT}/build/studio.meowv.com/data/livewall/version.json"
[[ -f "${PREVIOUS_FEED}" ]] || PREVIOUS_FEED="${ROOT}/build/version.json"
PREVIOUS_BUILD=""
if [[ -f "${PREVIOUS_FEED}" ]]; then
  PREVIOUS_BUILD="$(/usr/bin/python3 -c \
    'import json,sys; print(json.load(open(sys.argv[1])).get("build",""))' \
    "${PREVIOUS_FEED}" 2>/dev/null || echo "")"
fi

if [[ "${PREVIOUS_BUILD}" =~ ^[0-9]+$ ]] && [[ "${CURRENT_BUILD}" =~ ^[0-9]+$ ]]; then
  if (( CURRENT_BUILD <= PREVIOUS_BUILD )); then
    NEW_BUILD=$((PREVIOUS_BUILD + 1))
    # ⚠️ 定点改一行，**不要用 `PlistBuddy -c Set`** —— 它会重写整个文件：缩进从 4 空格
    #    变成 Tab、键按字母序重排，于是 diff 变成整片重写，与本次改动无关的噪音全进来了
    #    （2026-09-22 实测踩到）。读值用 PlistBuddy 没问题，写值不要用。
    /usr/bin/python3 - "${PLIST_PATH}" "${NEW_BUILD}" <<'PY'
import pathlib, re, sys
path, new_build = pathlib.Path(sys.argv[1]), sys.argv[2]
text = path.read_text(encoding="utf-8")
updated, count = re.subn(
    r"(<key>CFBundleVersion</key>\s*<string>)\d+(</string>)",
    lambda m: m.group(1) + new_build + m.group(2),
    text,
)
if count != 1:
    sys.exit(f"错误：{path} 里匹配到 {count} 处 CFBundleVersion（预期恰好 1 处）")
path.write_text(updated, encoding="utf-8")
PY
    echo "[build] CFBundleVersion 自动递增：${CURRENT_BUILD} → ${NEW_BUILD}（上次产物是 ${PREVIOUS_BUILD}）"
    echo "[build] 已写回 ${PLIST}，随本次改动一起提交即可"
  else
    echo "[build] CFBundleVersion：${CURRENT_BUILD}（高于上次产物的 ${PREVIOUS_BUILD}，保持不动）"
  fi
else
  # 两种原因分开报 —— 混成一句「找不到或不可用」会让人去翻路径，而实际可能只是值不对。
  if [[ -f "${PREVIOUS_FEED}" ]]; then
    echo "[build] 参照物存在但其中的 build 不是数字（${PREVIOUS_FEED}），CFBundleVersion 保持 ${CURRENT_BUILD}"
  else
    echo "[build] 参照物不存在（两条候选都没有），CFBundleVersion 保持 ${CURRENT_BUILD}"
  fi
fi

echo "[build] swift build -c $CONFIGURATION --product $PRODUCT"
cd "$ROOT"

# 用临时文件而不是管道：`swift build | grep ... || true` 会把编译失败一起吞掉，
# 而 .build/ 里可能残留上次的产物，导致静默使用过期二进制。
#
# 受限环境（某些沙箱 / CI）里 SwiftPM 自己的 `sandbox-exec` 会嵌套失败，
# 报 `sandbox_apply: Operation not permitted`。那时这样绕过：
#   SWIFT_BUILD_FLAGS="--disable-sandbox --manifest-cache none" ./build.sh
# 默认**不**加这些旗标 —— 正常环境该保留沙箱保护。
BUILD_LOG="$(mktemp)"
set +e
if [[ -n "${SWIFT_BUILD_FLAGS:-}" ]]; then
  # 故意不加引号：这里就是要让 shell 按空白拆成多个旗标。
  # shellcheck disable=SC2086
  swift build -c "$CONFIGURATION" --product "$PRODUCT" ${SWIFT_BUILD_FLAGS} >"$BUILD_LOG" 2>&1
else
  swift build -c "$CONFIGURATION" --product "$PRODUCT" >"$BUILD_LOG" 2>&1
fi
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

# 符号剥离。SwiftPM 的 release 产物仍带完整符号表（实测 2.2 万条），
# `nm` 一读就能还原出内部类型与方法名，等于把反编译门槛白送出去。
# strip -x 只去掉局部符号 —— 实测符号数降到约 1.9 千、体积减约 40%，
# 而**未定义符号与动态库依赖逐条不变**（已 diff 验证），故不影响加载。
#
# ⚠️ 必须在 codesign **之前**：改动二进制会让已有签名失效。
# ⚠️ strip 抹不掉 Swift 的**类型名** —— 它们在 __swift5_* 元数据段里，不在符号表。
#    要抹那部分只能改源码里的类型名，不是 strip 能覆盖的。
# 仅 release 剥离：debug 保留符号，便于崩溃定位。
if [[ "$CONFIGURATION" == "release" ]]; then
  APP_BINARY="$APP_BUNDLE/Contents/MacOS/$PRODUCT"
  SIZE_BEFORE="$(stat -f%z "$APP_BINARY")"
  if strip -x "$APP_BINARY"; then
    SIZE_AFTER="$(stat -f%z "$APP_BINARY")"
    echo "[build] 已剥离符号：$((SIZE_BEFORE / 1024)) KB → $((SIZE_AFTER / 1024)) KB"
  else
    echo "[build] 警告：strip 失败，产物仍带完整符号表" >&2
  fi
fi

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
