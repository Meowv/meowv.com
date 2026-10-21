#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALL_PROJECTS=(blog studio livewall api)
SELECTED_PROJECTS=()
PIDS=()
PID_PROJECTS=()

usage() {
  cat <<'EOF'
用法：
  ./run.sh                   启动全部项目
  ./run.sh all               启动全部项目
  ./run.sh <project> [...]   启动一个或多个指定项目
  ./run.sh wallpapers [...] 执行 Wallpapers 命令（默认 crawl）

可选项目：
  blog, b    http://localhost:4000
  studio, s  http://localhost:4001
  livewall, lw  启动 macOS 动态壁纸 App
  api, a  http://localhost:5000
  wallpapers, w  crawl / publish / stats / check
EOF
}

run_wallpapers() {
  local command="crawl"

  if [ "$#" -gt 0 ]; then
    case "$1" in
      crawl | publish | stats | check)
        command="$1"
        shift
        ;;
    esac
  fi

  echo "[wallpapers] 执行：${command}"
  (
    cd "$ROOT_DIR/wallpapers"
    PYTHONPATH=src python3 -m wallpapers "$command" \
      --db "$ROOT_DIR/wallpapers/wallpapers.db" "$@"
  )
}

project_port() {
  case "$1" in
    blog) echo "4000" ;;
    studio) echo "4001" ;;
    api) echo "5000" ;;
  esac
}

project_binary() {
  case "$1" in
    blog) echo "$ROOT_DIR/blog/node_modules/.bin/hexo" ;;
    studio) echo "$ROOT_DIR/studio/node_modules/.bin/vite" ;;
    livewall) echo "$ROOT_DIR/livewall/run.sh" ;;
    api) echo "dotnet" ;;
  esac
}

install_hint() {
  case "$1" in
    blog) echo "cd blog && yarn install --frozen-lockfile" ;;
    studio) echo "cd studio && pnpm install --frozen-lockfile" ;;
    livewall) echo "cd livewall && ./run.sh" ;;
    api) echo "dotnet run --project api/src/Meowv.Api" ;;
  esac
}

free_port() {
  local project="$1"
  local port="$2"
  local pids
  local pid
  local attempt

  if ! command -v lsof >/dev/null 2>&1; then
    echo "错误：未找到 lsof，无法检查并释放端口 ${port}。" >&2
    exit 1
  fi

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"
  if [ -z "$pids" ]; then
    return
  fi

  echo "端口 ${port} 已被占用，正在停止占用进程后启动 ${project}。"
  while IFS= read -r pid; do
    [ -n "$pid" ] && kill "$pid" >/dev/null 2>&1 || true
  done <<EOF
$pids
EOF

  for attempt in 1 2 3 4 5; do
    if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"
  echo "端口 ${port} 未在等待时间内释放，正在强制停止占用进程。" >&2
  while IFS= read -r pid; do
    [ -n "$pid" ] && kill -9 "$pid" >/dev/null 2>&1 || true
  done <<EOF
$pids
EOF

  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "错误：端口 ${port} 仍被占用，无法启动 ${project}。" >&2
    exit 1
  fi
}

check_project() {
  local project="$1"
  local binary
  local port

  if [ "$project" = "livewall" ]; then
    if ! command -v swift >/dev/null 2>&1; then
      echo "错误：未找到 Swift，无法启动 livewall。" >&2
      echo "请先安装 Xcode Command Line Tools。" >&2
      exit 1
    fi
    binary="$(project_binary "$project")"
    if [ ! -x "$binary" ]; then
      echo "错误：${project} 启动脚本不可用：$binary" >&2
      echo "请先执行：$(install_hint "$project")" >&2
      exit 1
    fi
    return
  fi

  if [ "$project" = "api" ]; then
    if ! command -v dotnet >/dev/null 2>&1; then
      echo "错误：未找到 .NET SDK，无法启动 api。" >&2
      exit 1
    fi
    if [ ! -f "$ROOT_DIR/api/src/Meowv.Api/Meowv.Api.csproj" ]; then
      echo "错误：未找到 api 项目文件。" >&2
      exit 1
    fi
    port="$(project_port "$project")"
    free_port "$project" "$port"
    return
  fi

  binary="$(project_binary "$project")"
  port="$(project_port "$project")"

  if [ ! -x "$binary" ]; then
    echo "错误：${project} 依赖尚未安装或启动程序不可用。" >&2
    echo "请先执行：$(install_hint "$project")" >&2
    exit 1
  fi

  free_port "$project" "$port"
}

run_project() {
  local project="$1"
  local port

  port="$(project_port "$project")"

  case "$project" in
    blog)
      echo "[$project] 启动中：http://localhost:$port"
      cd "$ROOT_DIR/blog"
      exec ./node_modules/.bin/hexo server --port "$port"
      ;;
    studio)
      echo "[$project] 启动中：http://localhost:$port"
      cd "$ROOT_DIR/studio"
      exec ./node_modules/.bin/vite --port "$port" --strictPort
      ;;
    livewall)
      echo "[$project] 启动 macOS 动态壁纸 App"
      cd "$ROOT_DIR/livewall"
      exec ./run.sh
      ;;
    api)
      echo "[$project] 启动中：http://localhost:$port"
      cd "$ROOT_DIR/api"
      exec dotnet run --project src/Meowv.Api --urls "http://localhost:$port" --contentRoot "$ROOT_DIR/api/src/Meowv.Api"
      ;;
  esac
}

stop_all() {
  local exit_code=$?
  local pid

  trap - EXIT INT TERM

  if [ "${#PIDS[@]}" -gt 0 ]; then
    echo
    echo "正在停止全部项目..."
    kill "${PIDS[@]}" >/dev/null 2>&1 || true
    for pid in "${PIDS[@]}"; do
      wait "$pid" >/dev/null 2>&1 || true
    done
  fi

  exit "$exit_code"
}

add_project() {
  local project="$1"
  local selected

  if [ -n "${SELECTED_PROJECTS[*]:-}" ]; then
    for selected in "${SELECTED_PROJECTS[@]}"; do
      if [ "$selected" = "$project" ]; then
        return
      fi
    done
  fi

  SELECTED_PROJECTS+=("$project")
}

if [ "$#" -eq 0 ] || { [ "$#" -eq 1 ] && [ "$1" = "all" ]; }; then
  SELECTED_PROJECTS=("${ALL_PROJECTS[@]}")
elif [ "$#" -eq 1 ] && { [ "$1" = "-h" ] || [ "$1" = "--help" ]; }; then
  usage
  exit 0
elif [ "$1" = "wallpapers" ] || [ "$1" = "w" ]; then
  shift
  run_wallpapers "$@"
  exit 0
else
  for argument in "$@"; do
    case "$argument" in
      blog | b) add_project "blog" ;;
      studio | s) add_project "studio" ;;
      livewall | lw) add_project "livewall" ;;
      api | a) add_project "api" ;;
      all)
        echo "错误：all 只能单独使用。" >&2
        usage >&2
        exit 1
        ;;
      *)
        echo "错误：未知项目 ${argument}。" >&2
        usage >&2
        exit 1
        ;;
    esac
  done
fi

for project in "${SELECTED_PROJECTS[@]}"; do
  check_project "$project"
done

if [ "${#SELECTED_PROJECTS[@]}" -eq 1 ]; then
  run_project "${SELECTED_PROJECTS[0]}"
fi

trap stop_all EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for project in "${SELECTED_PROJECTS[@]}"; do
  run_project "$project" &
  PIDS+=("$!")
  PID_PROJECTS+=("$project")
done

echo
echo "${#SELECTED_PROJECTS[@]} 个项目已启动，按 Ctrl+C 全部停止。"

while true; do
  for index in "${!PIDS[@]}"; do
    pid="${PIDS[$index]}"
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      set +e
      wait "$pid"
      child_status=$?
      set -e
      echo "${PID_PROJECTS[$index]} 已退出，正在停止其他项目。" >&2
      exit "$child_status"
    fi
  done
  sleep 1
done
