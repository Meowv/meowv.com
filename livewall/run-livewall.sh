#!/usr/bin/env bash
# 编译并启动「动态壁纸」App。
#
# 启动后会真实接管桌面壁纸层。退出方式：
#   - 菜单栏图标 → 退出
#   - 或 pkill -x LiveWall
#
# 日志：~/Library/Logs/com.meowv.livewall/livewall.log
#
# 清单由 App 自己从线上拉取（https://studio.meowv.com/data/livewall.json），
# 断网时用上次成功拉取的本地副本兜底 —— 这里不再同步任何清单文件。
#
# 用法：
#   ./run-livewall.sh              编译并启动
#   ./run-livewall.sh --no-build   不重新编译

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/build/LiveWall.app"

DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
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
  "$ROOT/build.sh" --product livewall
fi

if [[ ! -x "$APP/Contents/MacOS/LiveWall" ]]; then
  echo "错误：未找到 $APP，请先执行 ./build.sh --product livewall" >&2
  exit 1
fi

echo "[run] 启动 $APP"
echo "[run] 清单：https://studio.meowv.com/data/livewall.json"
echo "[run] 日志：~/Library/Logs/com.meowv.livewall/livewall.log"
echo "[run] 退出：菜单栏图标 → 退出，或 pkill -x LiveWall"
exec "$APP/Contents/MacOS/LiveWall"
