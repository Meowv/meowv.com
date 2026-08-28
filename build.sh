#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
ALL_PROJECTS=(blog studio zitie)
SELECTED_PROJECTS=()
STAGING_DIR="$ROOT_DIR/.build-staging.$$"
BACKUP_PATH=""
RESTORE_PATH=""

usage() {
  cat <<'EOF'
用法：
  ./build.sh                 编译全部项目
  ./build.sh all             编译全部项目
  ./build.sh <project> [...] 编译一个或多个指定项目
  ./build.sh studio --with-wallpapers 构建 Studio，并在构建前生成壁纸目录 JSON
  ./build.sh wallpapers      只生成 Studio 壁纸目录 JSON，不执行项目构建

可选项目：
  blog, b    -> build/meowv.com
  studio, s  -> build/studio.meowv.com
  zitie, z   -> build/zt.meowv.com
EOF
}

WITH_WALLPAPERS=0

publish_wallpapers_only() {
  local source_dir="$ROOT_DIR/studio/public/data"
  local build_data_dir="$BUILD_DIR/studio.meowv.com/data"

  echo "[wallpapers] 生成 Studio 壁纸目录数据..."
  (
    cd "$ROOT_DIR/wallpapers"
    PYTHONPATH=src python3 -m wallpapers publish \
      --db "$ROOT_DIR/wallpapers/wallpapers.db" \
      --output-dir "$source_dir"
  )
  node "$ROOT_DIR/studio/scripts/encrypt-wallpaper-catalog.mjs" "$source_dir"

  # 已存在构建产物时同步一份，便于直接部署 build/studio.meowv.com。
  if [ -d "$BUILD_DIR/studio.meowv.com" ]; then
    mkdir -p "$build_data_dir"
    rm -f "$build_data_dir"/wallpapers.catalog.*.bin
    rm -f "$build_data_dir"/wallpapers.catalog.*.json
    cp "$source_dir"/wallpapers.catalog.json "$source_dir"/wallpapers.catalog.*.bin "$build_data_dir"/
    echo "[wallpapers] 加密目录数据已同步到 $build_data_dir"
  fi

  echo "[wallpapers] JSON 数据源目录：$source_dir"
}

destination_name() {
  case "$1" in
    blog) echo "meowv.com" ;;
    studio) echo "studio.meowv.com" ;;
    zitie) echo "zt.meowv.com" ;;
  esac
}

source_path() {
  case "$1" in
    blog) echo "$ROOT_DIR/blog/public" ;;
    studio) echo "$ROOT_DIR/studio/dist" ;;
    zitie) echo "$ROOT_DIR/zitie/dist/client" ;;
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

check_project() {
  local project="$1"
  local binary
  local binaries=()

  if ! command -v node >/dev/null 2>&1; then
    echo "错误：未找到 Node.js，无法编译 ${project}。" >&2
    exit 1
  fi

  case "$project" in
    studio)
      binaries=(
        "$ROOT_DIR/studio/node_modules/.bin/vue-tsc"
        "$ROOT_DIR/studio/node_modules/.bin/vite"
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
    studio)
      (
        cd "$ROOT_DIR/studio"
        ./node_modules/.bin/vue-tsc --noEmit
        ./node_modules/.bin/vite build
      )
      ;;
    zitie)
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

  if [ -n "$BACKUP_PATH" ] && [ -e "$BACKUP_PATH" ]; then
    rm -rf "$BACKUP_PATH"
  fi
  BACKUP_PATH=""
  RESTORE_PATH=""
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
elif [ "$#" -eq 1 ] && { [ "$1" = "wallpapers" ] || [ "$1" = "w" ]; }; then
  publish_wallpapers_only
  exit 0
else
  for argument in "$@"; do
    case "$argument" in
      --with-wallpapers) WITH_WALLPAPERS=1 ;;
      blog | b) add_project "blog" ;;
      studio | s) add_project "studio" ;;
      zitie | z) add_project "zitie" ;;
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

if [ "$WITH_WALLPAPERS" -eq 1 ]; then
  found_studio=0
  for project in "${SELECTED_PROJECTS[@]}"; do
    [ "$project" = "studio" ] && found_studio=1
  done
  if [ "$found_studio" -eq 0 ]; then
    echo "错误：--with-wallpapers 只能与 studio 项目一起使用。" >&2
    exit 1
  fi
fi

if [ -e "$STAGING_DIR" ]; then
  echo "错误：临时目录已存在：$STAGING_DIR" >&2
  exit 1
fi

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir "$STAGING_DIR"

for project in "${SELECTED_PROJECTS[@]}"; do
  if [ "$project" = "studio" ] && [ "$WITH_WALLPAPERS" -eq 1 ]; then
    (
      cd "$ROOT_DIR/wallpapers"
      PYTHONPATH=src python3 -m wallpapers publish --db "$ROOT_DIR/wallpapers/wallpapers.db" --output-dir "$ROOT_DIR/studio/public/data"
    )
    node "$ROOT_DIR/studio/scripts/encrypt-wallpaper-catalog.mjs" "$ROOT_DIR/studio/public/data"
  fi
  build_project "$project"
  stage_output "$project"
done

if [ "${#SELECTED_PROJECTS[@]}" -eq "${#ALL_PROJECTS[@]}" ]; then
  publish_all
else
  for project in "${SELECTED_PROJECTS[@]}"; do
    publish_one "$project"
  done
  rmdir "$STAGING_DIR"
  STAGING_DIR=""
fi

trap - EXIT INT TERM

echo
echo "编译完成，发布目录：$BUILD_DIR"
for project in "${SELECTED_PROJECTS[@]}"; do
  echo "  $(destination_name "$project")/"
done
