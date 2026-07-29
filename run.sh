#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALL_PROJECTS=(blog excel pdf zitie)
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
  blog    http://localhost:4000
  excel   http://localhost:4001
  pdf     http://localhost:4002
  zitie   http://localhost:4003
EOF
}

project_port() {
  case "$1" in
    blog) echo "4000" ;;
    excel) echo "4001" ;;
    pdf) echo "4002" ;;
    zitie) echo "4003" ;;
  esac
}

project_binary() {
  case "$1" in
    blog) echo "$ROOT_DIR/blog/node_modules/.bin/hexo" ;;
    excel) echo "$ROOT_DIR/excel/node_modules/.bin/vite" ;;
    pdf) echo "$ROOT_DIR/pdf/node_modules/.bin/nuxt" ;;
    zitie) echo "$ROOT_DIR/zitie/node_modules/.bin/vinext" ;;
  esac
}

install_hint() {
  case "$1" in
    blog) echo "cd blog && yarn install --frozen-lockfile" ;;
    excel) echo "cd excel && pnpm install --frozen-lockfile" ;;
    pdf) echo "cd pdf && pnpm install --frozen-lockfile" ;;
    zitie) echo "cd zitie && npm ci" ;;
  esac
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

  if command -v lsof >/dev/null 2>&1 &&
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "错误：端口 $port 已被占用，无法启动 ${project}。" >&2
    exit 1
  fi
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
    excel)
      cd "$ROOT_DIR/excel"
      exec ./node_modules/.bin/vite --port "$port" --strictPort
      ;;
    pdf)
      cd "$ROOT_DIR/pdf"
      exec ./node_modules/.bin/nuxt dev --port "$port"
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
    blog | excel | pdf | zitie) SELECTED_PROJECTS=("$1") ;;
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
echo "4 个项目已启动，按 Ctrl+C 全部停止。"

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
