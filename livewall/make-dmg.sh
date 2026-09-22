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
# 仓库根。studio 的部署目录（build/studio.meowv.com/）在根下，不在 livewall/ 下 ——
# 少了这一层 `../` 会一直找不到 build 号参照物，递增校验静默失效（每次只打印「跳过」）。
REPO_ROOT="$(cd "${ROOT}/.." && pwd)"
APP_BUNDLE="${ROOT}/build/LiveWall.app"
VOLUME_NAME="LiveWall"
NO_BUILD=0

usage() {
  cat <<'EOF'
用法：./make-dmg.sh [选项]

选项：
  --no-build   直接打包现有的 build/LiveWall.app（默认会先跑 ./build.sh --bump-build）
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
  # --bump-build：打 DMG 就是发布，递增由 build.sh 在组装 App 与 codesign 之前完成。
  # 不传的话这里会撞上下面的递增校验（plist 里还是上一次的号）。
  "${ROOT}/build.sh" --bump-build
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

DMG_PATH="${ROOT}/build/LiveWall-${VERSION}.dmg"

# 暂存目录：卷根 = App + 指向 /Applications 的符号链接（用户拖过去就等于安装）
STAGE="$(mktemp -d)"
# 挂载点也放进 trap：下面自检失败时会 exit 1，那时还没走到手动清理。
MOUNT_POINT="$(mktemp -d)"
trap 'rm -rf "${STAGE}" "${MOUNT_POINT}"' EXIT
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

# 自检：能挂载、卷里两样东西都在、App 的签名完好。
#
# ⚠️ 与「签名失败就中断」同一严格度。这三项任意一项不过，发出去的 dmg 用户就是打不开
# （挂不上 / 少了 App / 签名坏了），而症状与「包本身有问题」无法区分。
# 此前这里只打印警告、不中断，且 `attach` 失败时**整个自检被静默跳过** ——
# 等于没有自检；加上通过时不输出任何东西，日志里根本看不出自检跑没跑。
if ! hdiutil attach "${DMG_PATH}" -nobrowse -mountpoint "${MOUNT_POINT}" >/dev/null 2>&1; then
  echo "错误：DMG 无法挂载，产物已损坏：${DMG_PATH}" >&2
  exit 1
fi

SELF_CHECK_FAILED=0
if [[ ! -d "${MOUNT_POINT}/LiveWall.app" ]]; then
  echo "错误：卷里没有 LiveWall.app" >&2
  SELF_CHECK_FAILED=1
fi
if [[ ! -L "${MOUNT_POINT}/Applications" ]]; then
  echo "错误：卷里没有 Applications 链接（用户无法拖拽安装）" >&2
  SELF_CHECK_FAILED=1
fi
if ! codesign -v "${MOUNT_POINT}/LiveWall.app" 2>/dev/null; then
  echo "错误：卷内 App 的签名校验未通过" >&2
  SELF_CHECK_FAILED=1
fi
hdiutil detach "${MOUNT_POINT}" >/dev/null 2>&1 || true

if [[ "${SELF_CHECK_FAILED}" -ne 0 ]]; then
  exit 1
fi
echo "[dmg] 自检通过：可挂载、卷内含 App 与 Applications 链接、签名完好"

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
# 这里**不要**再补一句「已校验 CFBundleVersion 已递增」—— 那行此前是无条件打印的，
# 走了「跳过」分支时也照打，等于把失效伪装成通过。校验结论只由上面那段输出一次。
echo "[dmg] 提醒：version.json 与 version.json.sig 必须**同一次**上传，少一个客户端就看不到更新"
echo "[dmg] 提示：未公证，别人首次打开需右键「打开」，或在「隐私与安全性」里点「仍要打开」"
