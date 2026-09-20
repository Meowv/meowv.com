#!/usr/bin/env bash
# 把 build/LiveWall.app 打成可分发的 DMG。
#
# 为什么用 DMG 而不是直接发 .app：
#   `.app` 是目录。用 Finder 的「压缩」打包会丢符号链接与权限位、还会带上 `__MACOSX` 垃圾；
#   DMG 保留全部元数据，双击挂载后把 App 拖进「应用程序」即可 —— 这是 macOS 的分发惯例。
#
# 用法：
#   ./make-dmg.sh              先按 release 构建，再打包
#   ./make-dmg.sh --no-build   直接打包现有的 build/LiveWall.app
#
# 产物：build/LiveWall-<版本>.dmg（卷名「LiveWall」，卷里是 App + 指向 /Applications 的链接）
# 注：DMG 用英文名；App 的**显示名**仍是「动态壁纸」（CFBundleDisplayName），两者不是一回事。
#
# ⚠️ 本 App 是 ad-hoc 签名、**未做公证**（公证要付费开发者账号，与「个人自用」定位不符）。
#    别人第一次打开会被 Gatekeeper 拦住，两种放行方式：
#      1. 右键 App →「打开」→ 再点「打开」（macOS 15 起需先到「系统设置 → 隐私与安全性」点「仍要打开」）
#      2. 终端：xattr -dr com.apple.quarantine "/Applications/LiveWall.app"
#
# ⚠️ 变量一律写成 `${VAR}`（含位置参数）。非 C locale 下 `$VAR（` 会把全角括号的首字节
#    并进变量名，`set -u` 直接报 `VAR?: unbound variable`（名字尾巴多一个替代字符）——
#    只有 `LC_ALL=C` 能掩盖它，所以本地/CI 跑通不代表用户终端跑得通。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_BUNDLE="${ROOT}/build/LiveWall.app"
VOLUME_NAME="LiveWall"
NO_BUILD=0

usage() {
  cat <<'EOF'
用法：./make-dmg.sh [选项]

选项：
  --no-build   直接打包现有的 build/LiveWall.app（默认会先跑 ./build.sh）
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
# build 号是**版本比对的权威值**（客户端只看它），同样从 plist 读。
BUILD_NUMBER="$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "${PLIST}" 2>/dev/null || echo 0)"
DMG_PATH="${ROOT}/build/LiveWall-${VERSION}.dmg"

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
  [[ -d "${MOUNT_POINT}/LiveWall.app" ]] || echo "[dmg] 警告：卷里没有 LiveWall.app" >&2
  [[ -L "${MOUNT_POINT}/Applications" ]] || echo "[dmg] 警告：卷里没有 Applications 链接" >&2
  codesign -v "${MOUNT_POINT}/LiveWall.app" 2>/dev/null || echo "[dmg] 警告：App 签名校验未通过" >&2
  hdiutil detach "${MOUNT_POINT}" >/dev/null 2>&1 || true
fi
rmdir "${MOUNT_POINT}" 2>/dev/null || true

# 版本信息（version.json）：与 dmg **同一次产出**，避免线上出现
# 「version.json 说 0.2.0、实际文件还是 0.1.0」这种不一致。
# 体积与摘要都由脚本算，不手写 —— 手抄一个 64 位 hex 迟早出错。
FEED_PATH="${ROOT}/build/version.json"
DMG_NAME="$(basename "${DMG_PATH}")"
DMG_SIZE="$(stat -f%z "${DMG_PATH}")"
DMG_SHA="$(shasum -a 256 "${DMG_PATH}" | awk '{print $1}')"
cat > "${FEED_PATH}" <<JSON
{
  "version": "${VERSION}",
  "build": ${BUILD_NUMBER},
  "notes": "",
  "sizeBytes": ${DMG_SIZE},
  "sha256": "${DMG_SHA}",
  "fileURL": "https://studio.meowv.com/data/livewall/${DMG_NAME}",
  "minOSVersion": "13.0"
}
JSON

# 对 version.json 的**原始字节**签名，产出 version.json.sig。
#
# 为什么必须在这里做、而且**失败就中断**：客户端只认验签通过的清单。少了 .sig 的表现是
# 「新版客户端永远看不到更新」—— 与「线上没发新版」的症状一模一样，没有任何别的信号，
# 排障会往完全错误的方向走。宁可这次打包失败，也不要产出一份发不出去的清单。
#
# 私钥在本机离线保存（默认 ~/.livewall-signing/version-key.txt），所以这一步只能在
# 持有私钥的机器上做；换机器要先拷私钥。详见 README「更新清单签名」。
#
# ⚠️ 签名覆盖的是**字节**，所以 version.json 一旦签好就不要再动它 ——
#    改缩进、调键顺序、加删尾随换行都会让签名失效（客户端那边表现为「签名与版本信息不符」）。
if [[ ! -x "${ROOT}/tools/sign-version.swift" ]]; then
  echo "错误：缺少 ${ROOT}/tools/sign-version.swift，或它没有可执行权限" >&2
  exit 1
fi

"${ROOT}/tools/sign-version.swift" sign \
  --json "${FEED_PATH}" \
  --dmg "${DMG_PATH}" \
  --pubkey-source "${ROOT}/Sources/LiveWallCore/UpdateSignature.swift"

SIG_PATH="${FEED_PATH}.sig"

SIZE="$(du -h "${DMG_PATH}" | cut -f1)"
echo "[dmg] 产物：${DMG_PATH}（${SIZE}）"
echo "[dmg] 版本信息：${FEED_PATH}（build ${BUILD_NUMBER}）"
echo "[dmg] 签名：${SIG_PATH}"
echo "[dmg] 提醒：发版前必须递增 CFBundleVersion —— 客户端只认它，忘了加就永远不提示"
echo "[dmg] 提醒：version.json 与 version.json.sig 必须**同一次**上传，少一个客户端就看不到更新"
echo "[dmg] 提示：未公证，别人首次打开需右键「打开」，或在「隐私与安全性」里点「仍要打开」"
