#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
ALL_PROJECTS=(blog img md office excel pdf zt)
SELECTED_PROJECTS=()
STAGING_DIR="$ROOT_DIR/.build-staging.$$"
BACKUP_PATH=""
RESTORE_PATH=""

usage() {
  cat <<'EOF'
用法：
  ./build.sh                 编译全部项目
  ./build.sh all             编译全部项目
  ./build.sh <project>       编译指定项目

可选项目：
  blog    -> build/meowv.com
  img     -> build/img.meowv.com
  md      -> build/md.meowv.com
  office  -> build/office.meowv.com
  excel   -> build/excel.meowv.com
  pdf     -> build/pdf.meowv.com
  zt      -> build/zt.meowv.com
EOF
}

destination_name() {
  case "$1" in
    blog) echo "meowv.com" ;;
    img) echo "img.meowv.com" ;;
    md) echo "md.meowv.com" ;;
    office) echo "office.meowv.com" ;;
    excel) echo "excel.meowv.com" ;;
    pdf) echo "pdf.meowv.com" ;;
    zt) echo "zt.meowv.com" ;;
  esac
}

source_path() {
  case "$1" in
    blog) echo "$ROOT_DIR/blog/public" ;;
    img) echo "$ROOT_DIR/image/dist/client" ;;
    md) echo "$ROOT_DIR/markdown/dist/client" ;;
    office) echo "$ROOT_DIR/office/dist/client" ;;
    excel) echo "$ROOT_DIR/excel/dist/client" ;;
    pdf) echo "$ROOT_DIR/pdf/.output/public" ;;
    zt) echo "$ROOT_DIR/zitie/dist/client" ;;
  esac
}

project_binary() {
  case "$1" in
    blog) echo "$ROOT_DIR/blog/node_modules/.bin/hexo" ;;
    img) echo "$ROOT_DIR/image/node_modules/.bin/vite" ;;
    md) echo "$ROOT_DIR/markdown/node_modules/.bin/vite" ;;
    office) echo "$ROOT_DIR/office/node_modules/.bin/vite" ;;
    excel) echo "$ROOT_DIR/excel/node_modules/.bin/vite" ;;
    pdf) echo "$ROOT_DIR/pdf/node_modules/.bin/nuxt" ;;
    zt) echo "$ROOT_DIR/zitie/node_modules/.bin/vinext" ;;
  esac
}

install_hint() {
  case "$1" in
    blog) echo "cd blog && yarn install --frozen-lockfile" ;;
    img) echo "cd image && npm ci" ;;
    md) echo "cd markdown && npm ci" ;;
    office) echo "cd office && pnpm install --frozen-lockfile" ;;
    excel) echo "cd excel && pnpm install --frozen-lockfile" ;;
    pdf) echo "cd pdf && pnpm install --frozen-lockfile" ;;
    zt) echo "cd zitie && npm ci" ;;
  esac
}

check_project() {
  local project="$1"
  local binary
  local binaries=()

  if ! command -v node >/dev/null 2>&1; then
    echo "错误：未找到 Node.js，无法编译 ${project}。" >&2
    exit 1
  fi

  case "$project" in
    office)
      binaries=(
        "$ROOT_DIR/office/node_modules/.bin/tsc"
        "$ROOT_DIR/office/node_modules/.bin/vite"
      )
      ;;
    excel)
      binaries=(
        "$ROOT_DIR/excel/node_modules/.bin/vue-tsc"
        "$ROOT_DIR/excel/node_modules/.bin/vite"
      )
      ;;
    md)
      binaries=(
        "$ROOT_DIR/markdown/node_modules/.bin/vue-tsc"
        "$ROOT_DIR/markdown/node_modules/.bin/vite"
      )
      ;;
    img)
      binaries=(
        "$ROOT_DIR/image/node_modules/.bin/vue-tsc"
        "$ROOT_DIR/image/node_modules/.bin/vite"
      )
      ;;
    *)
      binaries=("$(project_binary "$project")")
      ;;
  esac

  for binary in "${binaries[@]}"; do
    if [ ! -x "$binary" ]; then
      echo "错误：${project} 依赖尚未安装或编译程序不可用。" >&2
      echo "请先执行：$(install_hint "$project")" >&2
      exit 1
    fi
  done
}

build_project() {
  local project="$1"

  echo
  echo "[$project] 开始编译..."

  case "$project" in
    blog)
      (
        cd "$ROOT_DIR/blog"
        ./node_modules/.bin/hexo clean
        ./node_modules/.bin/hexo generate
      )
      ;;
    img)
      (
        cd "$ROOT_DIR/image"
        ./node_modules/.bin/vue-tsc --noEmit
        ./node_modules/.bin/vite build
      )
      ;;
    md)
      (
        cd "$ROOT_DIR/markdown"
        ./node_modules/.bin/vue-tsc --noEmit
        ./node_modules/.bin/vite build
      )
      ;;
    office)
      (
        cd "$ROOT_DIR/office"
        corepack pnpm build
      )
      ;;
    excel)
      (
        cd "$ROOT_DIR/excel"
        ./node_modules/.bin/vue-tsc -b
        ./node_modules/.bin/vite build
      )
      ;;
    pdf)
      (
        cd "$ROOT_DIR/pdf"
        ./node_modules/.bin/nuxt generate
      )
      ;;
    zt)
      (
        cd "$ROOT_DIR/zitie"
        node scripts/sync-hanzi-data.mjs
        ./node_modules/.bin/vinext build
      )
      ;;
  esac
}

stage_output() {
  local project="$1"
  local source
  local destination
  local first_entry

  source="$(source_path "$project")"
  destination="$STAGING_DIR/$(destination_name "$project")"

  if [ ! -d "$source" ]; then
    echo "错误：$project 编译完成后未找到产物目录：$source" >&2
    exit 1
  fi

  first_entry="$(find "$source" -mindepth 1 -maxdepth 1 -print -quit)"
  if [ -z "$first_entry" ]; then
    echo "错误：$project 产物目录为空：$source" >&2
    exit 1
  fi

  mkdir -p "$destination"
  cp -R "$source"/. "$destination"/
  echo "[$project] 已暂存到 $(destination_name "$project")/"
}

cleanup() {
  local exit_code=$?

  trap - EXIT INT TERM

  if [ -n "$BACKUP_PATH" ] && [ -e "$BACKUP_PATH" ]; then
    if [ -n "$RESTORE_PATH" ] && [ ! -e "$RESTORE_PATH" ]; then
      mv "$BACKUP_PATH" "$RESTORE_PATH" || true
    else
      rm -rf "$BACKUP_PATH"
    fi
  fi

  if [ -n "$STAGING_DIR" ] && [ -d "$STAGING_DIR" ]; then
    rm -rf "$STAGING_DIR"
  fi

  exit "$exit_code"
}

publish_all() {
  if [ -L "$BUILD_DIR" ]; then
    echo "错误：build 是符号链接，为避免覆盖外部目录，已停止发布。" >&2
    exit 1
  fi

  if [ -e "$BUILD_DIR" ] && [ ! -d "$BUILD_DIR" ]; then
    echo "错误：build 已存在且不是文件夹。" >&2
    exit 1
  fi

  if [ -d "$BUILD_DIR" ]; then
    BACKUP_PATH="$ROOT_DIR/.build-backup.$$"
    RESTORE_PATH="$BUILD_DIR"
    mv "$BUILD_DIR" "$BACKUP_PATH"
  fi

  mv "$STAGING_DIR" "$BUILD_DIR"
  STAGING_DIR=""

  if [ -n "$BACKUP_PATH" ] && [ -e "$BACKUP_PATH" ]; then
    rm -rf "$BACKUP_PATH"
  fi
  BACKUP_PATH=""
  RESTORE_PATH=""
}

publish_one() {
  local project="$1"
  local folder
  local destination

  folder="$(destination_name "$project")"
  destination="$BUILD_DIR/$folder"

  if [ -L "$BUILD_DIR" ]; then
    echo "错误：build 是符号链接，为避免覆盖外部目录，已停止发布。" >&2
    exit 1
  fi

  if [ -e "$BUILD_DIR" ] && [ ! -d "$BUILD_DIR" ]; then
    echo "错误：build 已存在且不是文件夹。" >&2
    exit 1
  fi

  mkdir -p "$BUILD_DIR"

  if [ -e "$destination" ] || [ -L "$destination" ]; then
    BACKUP_PATH="$ROOT_DIR/.build-backup.$folder.$$"
    RESTORE_PATH="$destination"
    mv "$destination" "$BACKUP_PATH"
  fi

  mv "$STAGING_DIR/$folder" "$destination"
  rmdir "$STAGING_DIR"
  STAGING_DIR=""

  if [ -n "$BACKUP_PATH" ] && [ -e "$BACKUP_PATH" ]; then
    rm -rf "$BACKUP_PATH"
  fi
  BACKUP_PATH=""
  RESTORE_PATH=""
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
    blog | img | md | office | excel | pdf | zt) SELECTED_PROJECTS=("$1") ;;
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

if [ -e "$STAGING_DIR" ]; then
  echo "错误：临时目录已存在：$STAGING_DIR" >&2
  exit 1
fi

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir "$STAGING_DIR"

for project in "${SELECTED_PROJECTS[@]}"; do
  build_project "$project"
  stage_output "$project"
done

if [ "${#SELECTED_PROJECTS[@]}" -eq "${#ALL_PROJECTS[@]}" ]; then
  publish_all
else
  publish_one "${SELECTED_PROJECTS[0]}"
fi

trap - EXIT INT TERM

echo
echo "编译完成，发布目录：$BUILD_DIR"
for project in "${SELECTED_PROJECTS[@]}"; do
  echo "  $(destination_name "$project")/"
done
