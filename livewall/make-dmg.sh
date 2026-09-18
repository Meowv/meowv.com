#!/usr/bin/env bash
# 把 build/动态壁纸.app 打成可分发的 DMG。
#
# 为什么用 DMG 而不是直接发 .app：
#   `.app` 是目录。用 Finder 的「压缩」打包会丢符号链接与权限位、还会带上 `__MACOSX` 垃圾；
#   DMG 保留全部元数据，双击挂载后把 App 拖进「应用程序」即可 —— 这是 macOS 的分发惯例。
#
# 用法：
#   ./make-dmg.sh              先按 release 构建，再打包
#   ./make-dmg.sh --no-build   直接打包现有的 build/动态壁纸.app
#
# 产物：build/动态壁纸-<版本>.dmg（卷名「动态壁纸」，卷里是 App + 指向 /Applications 的链接）
#
# ⚠️ 本 App 是 ad-hoc 签名、**未做公证**（公证要付费开发者账号，与「个人自用」定位不符）。
#    别人第一次打开会被 Gatekeeper 拦住，两种放行方式：
#      1. 右键 App →「打开」→ 再点「打开」（macOS 15 起需先到「系统设置 → 隐私与安全性」点「仍要打开」）
#      2. 终端：xattr -dr com.apple.quarantine "/Applications/动态壁纸.app"
#
# ⚠️ 变量一律写成 `${VAR}`（含位置参数）。非 C locale 下 `$VAR（` 会把全角括号的首字节
#    并进变量名，`set -u` 直接报 `VAR?: unbound variable`（名字尾巴多一个替代字符）——
#    只有 `LC_ALL=C` 能掩盖它，所以本地/CI 跑通不代表用户终端跑得通。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_BUNDLE="${ROOT}/build/动态壁纸.app"
VOLUME_NAME="动态壁纸"
NO_BUILD=0

usage() {
  cat <<'EOF'
用法：./make-dmg.sh [选项]

选项：
  --no-build   直接打包现有的 build/动态壁纸.app（默认会先跑 ./build.sh）
  -h, --help   显示本帮助
EOF
}

while [[ ${#} -gt 0 ]]; do
  case "${1}" in
    --no-build)
      NO_BUILD=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "错误：未知参数 ${1}" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${NO_BUILD}" -eq 0 ]]; then
  "${ROOT}/build.sh"
fi

if [[ ! -d "${APP_BUNDLE}" ]]; then
  echo "错误：缺少 ${APP_BUNDLE}（先跑 ./build.sh，或去掉 --no-build）" >&2
  exit 1
fi

# 版本号从 Info.plist 取，避免脚本里再维护一份
PLIST="${APP_BUNDLE}/Contents/Info.plist"
VERSION="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "${PLIST}" 2>/dev/null || echo 0.0.0)"
DMG_PATH="${ROOT}/build/动态壁纸-${VERSION}.dmg"

# 暂存目录：卷根 = App + 指向 /Applications 的符号链接（用户拖过去就等于安装）
STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT
cp -R "${APP_BUNDLE}" "${STAGE}/"
ln -s /Applications "${STAGE}/Applications"

rm -f "${DMG_PATH}"

# macOS 27 起 `hdiutil create` 已弃用（会打 deprecation 警告），优先用 diskutil；
# 旧系统没有 `diskutil image create`，回退到 hdiutil。
if diskutil image create from --volumeName "${VOLUME_NAME}" --format UDZO "${STAGE}" "${DMG_PATH}" >/dev/null 2>&1; then
  echo "[dmg] 已用 diskutil 打包（macOS 27 起的推荐命令）"
else
  echo "[dmg] diskutil 不可用，回退 hdiutil"
  hdiutil create -volname "${VOLUME_NAME}" -srcfolder "${STAGE}" -ov -format UDZO "${DMG_PATH}" >/dev/null
fi

# 自检：能挂载、卷里两样东西都在、App 的签名完好
MOUNT_POINT="$(mktemp -d)"
if hdiutil attach "${DMG_PATH}" -nobrowse -mountpoint "${MOUNT_POINT}" >/dev/null 2>&1; then
  [[ -d "${MOUNT_POINT}/动态壁纸.app" ]] || echo "[dmg] 警告：卷里没有 动态壁纸.app" >&2
  [[ -L "${MOUNT_POINT}/Applications" ]] || echo "[dmg] 警告：卷里没有 Applications 链接" >&2
  codesign -v "${MOUNT_POINT}/动态壁纸.app" 2>/dev/null || echo "[dmg] 警告：App 签名校验未通过" >&2
  hdiutil detach "${MOUNT_POINT}" >/dev/null 2>&1 || true
fi
rmdir "${MOUNT_POINT}" 2>/dev/null || true

SIZE="$(du -h "${DMG_PATH}" | cut -f1)"
echo "[dmg] 产物：${DMG_PATH}（${SIZE}）"
echo "[dmg] 提示：未公证，别人首次打开需右键「打开」，或在「隐私与安全性」里点「仍要打开」"
