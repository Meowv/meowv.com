#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELECTED_PROJECTS=()
DRY_RUN=0
SAW_ALL=0
CACHE_DIR="$ROOT_DIR/.deploy-cache"
TEMP_FILES=()

usage() {
  cat <<'EOF'
用法：
  ./deploy.sh [all | blog/b studio/s ...] [--dry-run]

无项目参数时上传全部项目；只上传 build/ 中已有产物，不执行构建。
--dry-run  连接服务器并预览需要上传的文件，不实际上传
EOF
}

fail() {
  echo "错误：$*" >&2
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    --dry-run) DRY_RUN=1 ;;
    all) SAW_ALL=1 ;;
    blog|b) SELECTED_PROJECTS+=(blog) ;;
    studio|s) SELECTED_PROJECTS+=(studio) ;;
    *) fail "未知参数：${arg}" ;;
  esac
done

if [ "$SAW_ALL" -eq 1 ] && [ -n "${SELECTED_PROJECTS[*]:-}" ]; then
  fail "all 不能与其他项目混用。"
fi
if [ -z "${SELECTED_PROJECTS[*]:-}" ]; then
  SELECTED_PROJECTS=(blog studio)
fi

PROJECTS=()
for project in "${SELECTED_PROJECTS[@]}"; do
  case " ${PROJECTS[*]:-} " in
    *" $project "*) ;;
    *) PROJECTS+=("$project") ;;
  esac
done

HOST_OVERRIDE="${DEPLOY_HOST-}"
PORT_OVERRIDE="${DEPLOY_PORT-}"
if [ -f "$ROOT_DIR/.deploy.env" ]; then
  source "$ROOT_DIR/.deploy.env"
fi
DEPLOY_HOST="${HOST_OVERRIDE:-${DEPLOY_HOST:-}}"
DEPLOY_PORT="${PORT_OVERRIDE:-${DEPLOY_PORT:-22}}"

[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$ ]] || fail "请在 .deploy.env 中设置 DEPLOY_HOST。"
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ ]] || fail "DEPLOY_PORT 必须是数字。"
DEPLOY_PORT=$((10#$DEPLOY_PORT))
[ "$DEPLOY_PORT" -ge 1 ] && [ "$DEPLOY_PORT" -le 65535 ] || fail "DEPLOY_PORT 超出范围。"

case "$DEPLOY_HOST" in
  *@*)
    DEPLOY_USER="${DEPLOY_HOST%@*}"
    DEPLOY_SERVER="${DEPLOY_HOST#*@}"
    ;;
  *) fail "DEPLOY_HOST 必须使用 user@host 格式。" ;;
esac

site_name() {
  case "$1" in
    blog) echo "meowv.com" ;;
    studio) echo "studio.meowv.com" ;;
  esac
}

for project in "${PROJECTS[@]}"; do
  site="$(site_name "$project")"
  source_dir="$ROOT_DIR/build/$site"
  [ -s "$source_dir/index.html" ] || fail "缺少 $source_dir/index.html，请先执行 ./build.sh ${project}。"
  echo "[$project] $source_dir -> C:/_qix/$site/"
done

command -v rclone >/dev/null 2>&1 || fail "未找到 rclone，请先执行 brew install rclone。"
[ -f "$HOME/.ssh/known_hosts" ] || fail "缺少 ~/.ssh/known_hosts，请先使用 ssh 连接一次服务器。"
mkdir -p "$CACHE_DIR"

cleanup() {
  local file
  for file in "${TEMP_FILES[@]:-}"; do
    [ -f "$file" ] && rm -f "$file"
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

RCLONE_OPTIONS=(
  --sftp-host "$DEPLOY_SERVER"
  --sftp-user "$DEPLOY_USER"
  --sftp-port "$DEPLOY_PORT"
  --sftp-ask-password
  --sftp-known-hosts-file "$HOME/.ssh/known_hosts"
  --sftp-shell-type none
  --sftp-set-modtime=false
  --ignore-times
  --progress
)
if [ "$DRY_RUN" -eq 1 ]; then
  RCLONE_OPTIONS+=(--dry-run)
fi

for project in "${PROJECTS[@]}"; do
  site="$(site_name "$project")"
  source_dir="$ROOT_DIR/build/$site"
  state_file="$CACHE_DIR/$site.sha256"
  current_file="$CACHE_DIR/.$site.current.$$"
  changed_file="$CACHE_DIR/.$site.changed.$$"
  TEMP_FILES+=("$current_file" "$changed_file")

  rclone hashsum SHA256 "$source_dir" --config /dev/null --output-file "$current_file"
  if [ -f "$state_file" ]; then
    awk '
      NR == FNR { previous[substr($0, 67)] = substr($0, 1, 64); next }
      { path = substr($0, 67); if (!(path in previous) || previous[path] != substr($0, 1, 64)) print path }
    ' "$state_file" "$current_file" > "$changed_file"
  else
    awk '{ print substr($0, 67) }' "$current_file" > "$changed_file"
  fi

  if [ ! -s "$changed_file" ]; then
    echo "[$project] 没有变化，跳过上传。"
    if [ "$DRY_RUN" -eq 0 ]; then
      mv "$current_file" "$state_file"
    fi
    continue
  fi

  file_count="$(wc -l < "$changed_file" | tr -d ' ')"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[$project] 预览 $file_count 个变化文件..."
  else
    echo "[$project] 上传 $file_count 个变化文件..."
  fi
  rclone copy "$source_dir" ":sftp:/C:/_qix/$site" --config /dev/null --files-from-raw "$changed_file" "${RCLONE_OPTIONS[@]}"
  if [ "$DRY_RUN" -eq 0 ]; then
    mv "$current_file" "$state_file"
  fi
done

if [ "$DRY_RUN" -eq 1 ]; then
  echo "预览完成，未上传。"
else
  echo "上传完成。"
fi
