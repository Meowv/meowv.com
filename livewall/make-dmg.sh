#!/usr/bin/env bash
# 把 build/LiveWall.app 打成可分发的 DMG。
#
# 为什么用 DMG 而不是直接发 .app：
#   `.app` 是目录。用 Finder 的「压缩」打包会丢符号链接与权限位、还会带上 `__MACOSX` 垃圾；
#   DMG 保留全部元数据，双击挂载后把 App 拖进「应用程序」即可 —— 这是 macOS 的分发惯例。
#
# 用法：
#   ./make-dmg.sh              先按 release 构建（含 build 号递增），再打包
#   ./make-dmg.sh --no-build   直接打包现有的 build/LiveWall.app
#
# 产物：build/LiveWall-<版本>.dmg（卷名「LiveWall」）
# 卷里是 App + 指向 /Applications 的链接 + 一套定制过的安装窗口版式：背景图
# （文案和箭头画在图里）、固定图标坐标、卷图标。版式靠 `.DS_Store` 落地。
# 背景图由 tools/make-dmg-background.swift 在打包时生成，不存静态资产。
#
# ⚠️ 打这个包需要三项本机条件，缺了会**中断**而不是降级：
#    1. Finder 的「自动化」权限（系统设置 → 隐私与安全性 → 自动化 → 允许终端控制「访达」）。
#       布局是让 Finder 亲自摆出来再落盘的，没权限就产不出 `.DS_Store`。
#    2. `tiffutil`、`SetFile` 与 `GetFileInfo`（随 Xcode Command Line Tools 提供）。
#    3. `swift`（生成背景图；`build.sh` 本来就要它）。
#    定制时需要 /Volumes/LiveWall；若同名卷已挂载，脚本会中断，请先手动推出。
#
# ⚠️ 卷名必须保持「LiveWall」：`.DS_Store` 里的背景图引用同时存了绝对路径
#    （/Volumes/LiveWall/...）与相对路径，改卷名会让绝对那半失效。
#
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
# 仓库根。studio 的部署目录（build/studio.meowv.com/）在根下，不在 livewall/ 下 ——
# 少了这一层 `../` 会一直找不到 build 号参照物，递增校验静默失效（每次只打印「跳过」）。
REPO_ROOT="$(cd "${ROOT}/.." && pwd)"
BUILD_DIR="${LIVEWALL_RELEASE_BUILD_DIR:-${ROOT}/build}"
APP_BUNDLE="${BUILD_DIR}/LiveWall.app"
VOLUME_NAME="LiveWall"
NO_BUILD=0

usage() {
  cat <<'EOF'
用法：./make-dmg.sh [选项]

选项：
  --no-build   仅供同批发布流程内部打包暂存 App（不能单独使用）
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

if [[ -z "${LIVEWALL_RELEASE_BUILD_DIR:-}" ]]; then
  if [[ "${NO_BUILD}" -eq 0 ]]; then
    exec "${REPO_ROOT}/build.sh" livewall --with-dmg
  fi
  echo "错误：--no-build 仅供同批发布流程内部使用；请运行 ./make-dmg.sh。" >&2
  exit 2
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

# ── build 号递增校验（兜底）────────────────────────────
# 递增本身由 `livewall/build.sh --bump-build` 完成 —— 它必须在组装 App 与 codesign
# **之前**写回源 plist，包内的 Info.plist 一旦改过签名就失效了。
# 这个旗标只有发布路径会传（根 `build.sh`、本脚本），本地运行 `./run.sh` 不传，
# 所以开发运行既不动 build 号，也不会走到这里。
# 这里只做**兜底校验**：拦「用 `--no-build` 打一个**旧的** .app」这种情况 ——
# 那时包内 build 号已经定死（改它会破坏签名），只能拦下来。
# （根 `build.sh` 也是用 `--no-build` 调本脚本的，但那时 .app 刚被
#   `livewall/build.sh --bump-build` 递增过，所以正常路径撞不到这条。）
#
# 为什么值得拦：客户端**只认 `CFBundleVersion`**（`UpdateEvaluator` 判
# `feed.build > localBuild`）。不递增的话用户**永远看不到更新提示**，
# 而症状与「线上没发新版」完全一样，排障会往完全错误的方向走。
#
# 参照物优先取「上次已装进 studio 部署目录的那一份」（最接近线上），其次取本地产物。
FEED_IN_DEPLOY="${REPO_ROOT}/build/studio.meowv.com/data/livewall/version.json"
FEED_IN_LIVEWALL="${ROOT}/build/version.json"
PREVIOUS_FEED="${FEED_IN_DEPLOY}"
[[ -f "${PREVIOUS_FEED}" ]] || PREVIOUS_FEED="${FEED_IN_LIVEWALL}"
PREVIOUS_BUILD=""
if [[ -f "${PREVIOUS_FEED}" ]]; then
  # 用 CLT 自带的 python3 读 JSON（项目本来就要 CLT）。取不到就当没有参照物。
  PREVIOUS_BUILD="$(/usr/bin/python3 -c \
    'import json,sys; print(json.load(open(sys.argv[1])).get("build",""))' \
    "${PREVIOUS_FEED}" 2>/dev/null || echo "")"
fi

if [[ "${PREVIOUS_BUILD}" =~ ^[0-9]+$ ]] && [[ "${BUILD_NUMBER}" =~ ^[0-9]+$ ]]; then
  if (( BUILD_NUMBER <= PREVIOUS_BUILD )); then
    echo "错误：CFBundleVersion 没有递增（本次 ${BUILD_NUMBER} ≤ 上次 ${PREVIOUS_BUILD}，来源 ${PREVIOUS_FEED}）。" >&2
    echo "      客户端只认它：不递增的话用户**永远看不到更新提示**，症状与「线上没发新版」一模一样。" >&2
    echo "      正常路径不会走到这里 —— livewall/build.sh --bump-build 会在组装 App 前自动递增。" >&2
    echo "      撞到它说明这次用的是 --no-build 且手上的 .app 是旧的。两种解法：" >&2
    echo "        · 去掉 --no-build 重跑 ./make-dmg.sh（它会自己递增）" >&2
    echo "        · 或先 ./build.sh --bump-build 重新组装 App，再回来 --no-build 打包" >&2
    echo "      ⚠️ 裸跑 ./build.sh 不递增（那是本地打包，不是发布路径），别指望它。" >&2
    exit 1
  fi
  echo "[dmg] build 号递增检查通过：${PREVIOUS_BUILD} → ${BUILD_NUMBER}"
else
  # 跳过有两种原因，混在一句话里会让排障往错方向走（曾因此误判成「首次发版」）。
  # 分开展示，并列出**两条**候选路径的存在性与读数 —— 一眼看出断在哪一环。
  echo "[dmg] 跳过 build 号递增检查"
  for candidate in "${FEED_IN_DEPLOY}" "${FEED_IN_LIVEWALL}"; do
    if [[ ! -f "${candidate}" ]]; then
      echo "[dmg]   参照物不存在：${candidate}"
    else
      echo "[dmg]   参照物存在但 build 不是数字：${candidate}"
    fi
  done
  echo "[dmg]   首次发版（本机从未产出过 version.json）属正常；"
  echo "[dmg]   否则说明参照物路径不对，递增校验**没有生效** —— 检查上面两条路径。"
fi

DMG_PATH="${BUILD_DIR}/LiveWall-${VERSION}.dmg"

# ── 安装窗口的版式 ────────────────────────────────────
# 背景图由 tools/make-dmg-background.swift 在打包时生成。图标坐标与生成器里的 appIconCenter /
# dropLinkCenter **成对**，改一处就要改另一处，否则箭头会指不到图标上。
DMG_BG_TOOL="${ROOT}/tools/make-dmg-background.swift"
VOLUME_ICON="${ROOT}/Resources/AppIcon.icns"
# Finder 的 AppleScript 用**磁盘上的文件名**匹配条目（不是中文显示名「动态壁纸」）；
# `set position` 给的是**图标中心**，不是左上角。
APP_ITEM="LiveWall.app"
APP_ITEM_POS="180, 252"
DROP_ITEM_POS="580, 252"
# 窗口内容区 760×480，与背景图同尺寸；bounds 高度还要加上标题栏。
WINDOW_WIDTH=760
WINDOW_HEIGHT=480
TITLEBAR_HEIGHT=28
WINDOW_LEFT=200
WINDOW_TOP=200

for tool in swift tiffutil SetFile GetFileInfo osascript; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "错误：缺少 ${tool}" >&2
    exit 1
  fi
done

if [[ ! -x "${DMG_BG_TOOL}" ]]; then
  echo "错误：缺少 ${DMG_BG_TOOL}，或它没有可执行权限" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
STAGE="${WORK_DIR}/stage"
RW_PATH="${WORK_DIR}/LiveWall-rw.dmg"
# ⚠️ 定制阶段必须挂到**默认的** /Volumes/<卷名>：挂到自定义 mountpoint 时 Finder 认不出
#    这个卷（`tell disk` 直接报 -1728），整段布局定制会失效且不报错。自检阶段用临时挂载点。
MOUNT_POINT="/Volumes/${VOLUME_NAME}"
CHECK_POINT="${WORK_DIR}/check"
RW_DEVICE=""
CHECK_ATTACHED=0

cleanup() {
  if [[ -n "${RW_DEVICE}" ]]; then
    hdiutil detach "${RW_DEVICE}" >/dev/null 2>&1 || true
  fi
  if [[ "${CHECK_ATTACHED}" -eq 1 ]]; then
    hdiutil detach "${CHECK_POINT}" >/dev/null 2>&1 || true
  fi
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

if [[ -e "${MOUNT_POINT}" || -L "${MOUNT_POINT}" ]]; then
  echo "错误：${MOUNT_POINT} 已存在，请先手动推出同名卷再重跑" >&2
  exit 1
fi

mkdir -p "${STAGE}/.background" "${CHECK_POINT}"
cp -R "${APP_BUNDLE}" "${STAGE}/"
ln -s /Applications "${STAGE}/Applications"

if [[ ! -f "${VOLUME_ICON}" ]]; then
  echo "错误：缺少卷图标 ${VOLUME_ICON}" >&2
  exit 1
fi

# 背景图在打包时生成，不保留额外的静态资产。
# 生成失败就中断 —— 静默产出「没有背景图」的 DMG，与正常产物在别处完全看不出区别。
BG_DIR="${WORK_DIR}/bg"
"${DMG_BG_TOOL}" --out-dir "${BG_DIR}"
# 1x + 2x 合成多分辨率 TIFF，高分屏才会取到清晰那张
tiffutil -cathidpicheck "${BG_DIR}/dmg-background.png" "${BG_DIR}/dmg-background@2x.png" \
  -out "${STAGE}/.background/dmg-background.tiff" >/dev/null
cp "${VOLUME_ICON}" "${STAGE}/.VolumeIcon.icns"

rm -f "${DMG_PATH}" "${RW_PATH}"

# ── 第一步：可读写镜像 ────────────────────────────────
# 图标坐标只能由 Finder 亲自写进 .DS_Store，所以必须「建可读写镜像 → 挂载定制 → 转压缩」
# 三段式，不能再像以前那样一步 `create -srcfolder` 出成品。
# 注意 `diskutil image create` 只支持只读格式（UDRO/UDZO/ULFO…），**没有 UDRW** ——
# 这一步只能用 hdiutil，代价是 macOS 27 起会打 deprecation 警告。
hdiutil create -volname "${VOLUME_NAME}" -srcfolder "${STAGE}" -ov -format UDRW "${RW_PATH}" >/dev/null

if ! RW_ATTACH_PLIST="$(hdiutil attach "${RW_PATH}" -plist -nobrowse 2>/dev/null)"; then
  echo "错误：可读写镜像挂载失败，无法定制 DMG 布局" >&2
  exit 1
fi
if ! RW_MOUNT_INFO="$(printf '%s' "${RW_ATTACH_PLIST}" | /usr/bin/python3 -c '
import plistlib, sys
entities = plistlib.loads(sys.stdin.buffer.read())["system-entities"]
volume = next(entry for entry in entities if entry.get("mount-point"))
print(volume["dev-entry"])
print(volume["mount-point"])
')"; then
  echo "错误：无法确认可读写镜像的挂载设备，请手动检查已挂载的 ${VOLUME_NAME} 卷" >&2
  exit 1
fi
RW_DEVICE="${RW_MOUNT_INFO%%$'\n'*}"
RW_MOUNT_POINT="${RW_MOUNT_INFO#*$'\n'}"
if [[ "${RW_MOUNT_POINT}" != "${MOUNT_POINT}" ]]; then
  echo "错误：镜像挂载到了 ${RW_MOUNT_POINT}，预期为 ${MOUNT_POINT}" >&2
  exit 1
fi

# ── 第二步：让 Finder 摆布局 ──────────────────────────
# 首次运行会弹「自动化」授权，被拒就失败。这里**必须中断**：定制失败的产物只是
# 「没背景图、图标位置随机」，与正常产物在别处完全看不出区别，会一路发出去。
#
# ⚠️ 三条栏都要关：工具栏、状态栏、**路径栏**。最容易漏的是路径栏 —— 它在窗口**底部**
#    显示「卷图标 + 卷名」，右下角还会长出拖拽把手。漏关它，图标视图高度就比背景图
#    少约 24pt（背景图底部被裁），而且用户会看到把手去拖窗口。
#    关掉路径栏后，图标视图高度 = bounds − 标题栏 28，正好等于背景图高度。
#
# 注：窗口**大小本身锁不住** —— Finder 词典里 `resizable` 是只读（access="r"），
#    `.DS_Store` 也没有对应键。能做的只是把三条栏关掉、消除拖拽把手这个视觉诱因。
if ! osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "${VOLUME_NAME}"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set pathbar visible of container window to false
    set the bounds of container window to {${WINDOW_LEFT}, ${WINDOW_TOP}, $((WINDOW_LEFT + WINDOW_WIDTH)), $((WINDOW_TOP + WINDOW_HEIGHT + TITLEBAR_HEIGHT))}
    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 128
    set background picture of viewOptions to file ".background:dmg-background.tiff"
    set position of item "${APP_ITEM}" of container window to {${APP_ITEM_POS}}
    set position of item "Applications" of container window to {${DROP_ITEM_POS}}
    update without registering applications
    delay 2
  end tell
end tell
APPLESCRIPT
then
  echo "错误：Finder 布局定制失败。" >&2
  echo "      多为「自动化」权限被拒 —— 到「系统设置 → 隐私与安全性 → 自动化」" >&2
  echo "      勾选终端（或当前 App）控制「访达」，然后重跑。" >&2
  exit 1
fi

osascript -e "tell application \"Finder\" to close every window of disk \"${VOLUME_NAME}\"" >/dev/null 2>&1 || true
sleep 1

# ⚠️ 顺序陷阱：Finder 摆布局的过程会把 .VolumeIcon.icns 删掉、并清掉卷的自定义图标标志
#    （实测：SetFile -a C 先做的话，走完 AppleScript 就变回 avbstclinmedz 且文件消失）。
#    所以必须在它**之后**重新放回并重设标志，再卸载。反过来做等于白干。
cp "${VOLUME_ICON}" "${MOUNT_POINT}/.VolumeIcon.icns"
SetFile -a C "${MOUNT_POINT}"
sync
sleep 1

hdiutil detach "${RW_DEVICE}" >/dev/null 2>&1
RW_DEVICE=""

# ── 第三步：转成压缩镜像 ──────────────────────────────
# macOS 27 起 `hdiutil convert` 已弃用，优先用 diskutil（同源转换，实测保留
# .DS_Store、.background 与卷图标标志）；旧系统回退 hdiutil。
if ! diskutil image create from "${RW_PATH}" --format UDZO "${DMG_PATH}" >/dev/null 2>&1; then
  echo "[dmg] diskutil 转换未成功，尝试 hdiutil convert"
  hdiutil convert "${RW_PATH}" -format UDZO -o "${DMG_PATH}" >/dev/null
fi
rm -f "${RW_PATH}"

# 自检：能挂载、卷里东西齐全、App 的签名完好、安装窗口的版式真的落地了。
#
# ⚠️ 与「签名失败就中断」同一严格度。这些项任意一项不过，发出去的 dmg 用户看到的就是
# 「打不开」或「一个光秃秃的窗口」，而症状与「包本身有问题」无法区分。
# 此前这里只打印警告、不中断，且 `attach` 失败时**整个自检被静默跳过** ——
# 等于没有自检；加上通过时不输出任何东西，日志里根本看不出自检跑没跑。
if ! hdiutil attach "${DMG_PATH}" -nobrowse -mountpoint "${CHECK_POINT}" >/dev/null 2>&1; then
  echo "错误：DMG 无法挂载，产物已损坏：${DMG_PATH}" >&2
  exit 1
fi
CHECK_ATTACHED=1

SELF_CHECK_FAILED=0
if [[ ! -d "${CHECK_POINT}/LiveWall.app" ]]; then
  echo "错误：卷里没有 LiveWall.app" >&2
  SELF_CHECK_FAILED=1
fi
if [[ ! -L "${CHECK_POINT}/Applications" ]]; then
  echo "错误：卷里没有 Applications 链接（用户无法拖拽安装）" >&2
  SELF_CHECK_FAILED=1
fi
if ! codesign -v "${CHECK_POINT}/LiveWall.app" 2>/dev/null; then
  echo "错误：卷内 App 的签名校验未通过" >&2
  SELF_CHECK_FAILED=1
fi
# 版式三件套。缺任何一件，用户看到的都是一个没背景、图标乱放的窗口。
if [[ ! -f "${CHECK_POINT}/.DS_Store" ]]; then
  echo "错误：卷里没有 .DS_Store（窗口尺寸、图标坐标、背景图引用都会丢失）" >&2
  SELF_CHECK_FAILED=1
fi
if [[ ! -f "${CHECK_POINT}/.background/dmg-background.tiff" ]]; then
  echo "错误：卷里没有背景图 .background/dmg-background.tiff" >&2
  SELF_CHECK_FAILED=1
fi
if [[ "$(GetFileInfo -a "${CHECK_POINT}")" != *C* ]]; then
  echo "错误：卷的自定义图标标志（SetFile -a C）没有保留，卷图标会退回默认磁盘图标" >&2
  SELF_CHECK_FAILED=1
fi
if ! hdiutil detach "${CHECK_POINT}" >/dev/null 2>&1; then
  echo "错误：自检镜像无法卸载：${CHECK_POINT}" >&2
  exit 1
fi
CHECK_ATTACHED=0

if [[ "${SELF_CHECK_FAILED}" -ne 0 ]]; then
  exit 1
fi
echo "[dmg] 自检通过：可挂载、App 与 Applications 链接齐全、签名完好、安装窗口版式已落地"

# 版本信息（version.json）：与 dmg **同一次产出**，避免线上出现
# 「version.json 说 0.2.0、实际文件还是 0.1.0」这种不一致。
# 体积与摘要都由脚本算，不手写 —— 手抄一个 64 位 hex 迟早出错。
FEED_PATH="${BUILD_DIR}/version.json"
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
  "minOSVersion": "26.0"
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
# 这里**不要**再补一句「已校验 CFBundleVersion 已递增」—— 那行此前是无条件打印的，
# 走了「跳过」分支时也照打，等于把失效伪装成通过。校验结论只由上面那段输出一次。
echo "[dmg] 提醒：version.json 与 version.json.sig 必须**同一次**上传，少一个客户端就看不到更新"
echo "[dmg] 提示：未公证，别人首次打开需右键「打开」，或在「隐私与安全性」里点「仍要打开」"
