#!/usr/bin/env bash
# 编译并启动「动态壁纸」App（开发运行）。
#
# 启动后会真实接管桌面壁纸层。退出方式：
#   - 菜单栏图标 → 退出动态壁纸
#   - 或 pkill -x LiveWall（触发正常清理并把当前这张的静态图留在桌面上）
#
# 日志：~/Library/Logs/com.meowv.livewall/livewall.log
#
# 构建配置：默认 **debug**。开发者工具（菜单里的「打印窗口层级表」）用
# `#if DEBUG` 隔离，只在 debug 构建里存在 —— 想验发布版行为用 ./build.sh（release）。
#
# 清单由 App 自己从线上拉取（https://studio.meowv.com/data/livewall/catalog.json），
# 断网时用上次成功拉取的本地副本兜底 —— 这里不再同步任何清单文件。
#
# 注意：本脚本是 livewall 子项目的运行脚本，与仓库根目录的 run.sh 无关
# （根目录那套是「Web 项目 → build/<域名>/」的模型，不含本项目）。
#
# 用法：
#   ./run.sh              以 debug 配置编译并启动（带开发者菜单）
#   ./run.sh --release    以 release 配置编译并启动（等同发布版行为）
#   ./run.sh --no-build   不重新编译，直接启动现有产物

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/build/LiveWall.app"

DO_BUILD=1
CONFIGURATION="debug"
for arg in "$@"; do
  case "$arg" in
    --release) CONFIGURATION="release" ;;
    --no-build) DO_BUILD=0 ;;
    -h | --help)
      /usr/bin/sed -n '2,/^$/p' "$0" | /usr/bin/sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "错误：未知参数 $arg" >&2
      exit 2
      ;;
  esac
done

if [[ "$DO_BUILD" -eq 1 ]]; then
  if [[ "$CONFIGURATION" == "debug" ]]; then
    "$ROOT/build.sh" --product livewall --debug
  else
    "$ROOT/build.sh" --product livewall
  fi
fi

if [[ ! -x "$APP/Contents/MacOS/LiveWall" ]]; then
  echo "错误：未找到 ${APP}，请先执行 ./build.sh --product livewall" >&2
  exit 1
fi

echo "[run] 启动 ${APP}（$CONFIGURATION 构建）"
echo "[run] 清单：https://studio.meowv.com/data/livewall/catalog.json"
echo "[run] 日志：~/Library/Logs/com.meowv.livewall/livewall.log"
echo "[run] 退出：菜单栏图标 → 退出动态壁纸，或 pkill -x LiveWall"
exec "$APP/Contents/MacOS/LiveWall"
