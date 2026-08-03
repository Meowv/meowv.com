#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALL_PROJECTS=(blog studio zitie)
SELECTED_PROJECTS=()
PIDS=()
PID_PROJECTS=()

usage() {
  cat <<'EOF'
用法：
  ./run.sh                   启动全部项目
  ./run.sh all               启动全部项目
  ./run.sh <project>         启动指定项目

可选项目：
  blog, b    http://localhost:4000
  studio, s  http://localhost:4001
  zitie, z   http://localhost:4002
EOF
}

project_port() {
  case "$1" in
    blog) echo "4000" ;;
    studio) echo "4001" ;;
    zitie) echo "4002" ;;
  esac
}

project_binary() {
  case "$1" in
    blog) echo "$ROOT_DIR/blog/node_modules/.bin/hexo" ;;
    studio) echo "$ROOT_DIR/studio/node_modules/.bin/vite" ;;
    zitie) echo "$ROOT_DIR/zitie/node_modules/.bin/vinext" ;;
  esac
}

install_hint() {
  case "$1" in
    blog) echo "cd blog && yarn install --frozen-lockfile" ;;
    studio) echo "cd studio && pnpm install --frozen-lockfile" ;;
    zitie) echo "cd zitie && npm ci" ;;
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
  echo "[$project] 启动中：http://localhost:$port"

  case "$project" in
    blog)
      cd "$ROOT_DIR/blog"
      exec ./node_modules/.bin/hexo server --port "$port"
      ;;
    studio)
      cd "$ROOT_DIR/studio"
      exec ./node_modules/.bin/vite --port "$port" --strictPort
      ;;
    zitie)
      cd "$ROOT_DIR/zitie"
      node scripts/sync-hanzi-data.mjs
      exec ./node_modules/.bin/vinext dev --port "$port"
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

if [ "$#" -gt 1 ]; then
  usage >&2
  exit 1
fi

if [ "$#" -eq 0 ] || [ "${1:-}" = "all" ]; then
  SELECTED_PROJECTS=("${ALL_PROJECTS[@]}")
elif [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
else
  case "$1" in
    blog | b) SELECTED_PROJECTS=("blog") ;;
    studio | s) SELECTED_PROJECTS=("studio") ;;
    zitie | z) SELECTED_PROJECTS=("zitie") ;;
    *)
      echo "错误：未知项目 ${1}。" >&2
      usage >&2
      exit 1
      ;;
  esac
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
echo "${#ALL_PROJECTS[@]} 个项目已启动，按 Ctrl+C 全部停止。"

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
