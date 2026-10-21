#!/usr/bin/env bash

set -euo pipefail

ORIGINAL_ARGUMENTS=("$@")

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ROOT_DIR/tools/wallpapers-python.sh"
BUILD_DIR="$ROOT_DIR/build"
ALL_PROJECTS=(blog studio livewall api)
SELECTED_PROJECTS=()
STAGING_DIR="$ROOT_DIR/.build-staging.$$"
BACKUP_PATH=""
RESTORE_PATH=""
WALLPAPER_KEY_FILE="$ROOT_DIR/.wallpaper-key"
CURRENT_LIVEWALL_KEY_FILE="$ROOT_DIR/.livewall-key"
LIVEWALL_KEY_TEMP=""
LIVEWALL_STAGE_DIR="$ROOT_DIR/.livewall-staging.$$"
LIVEWALL_PROMOTION_JOURNAL="$ROOT_DIR/.livewall-promotion.json"

usage() {
  cat <<'EOF'
用法：
  ./build.sh                 编译全部项目
  ./build.sh all             编译全部项目
  ./build.sh <project> [...] 编译一个或多个指定项目
  ./build.sh studio --with-wallpapers 构建 Studio，并在构建前生成壁纸目录
  ./build.sh wallpapers      只生成 Studio 壁纸目录，不执行项目构建
  ./build.sh livewall --with-dmg 构建 livewall，并额外打出可分发的 DMG
  ./build.sh api [--rid <RID>] 构建统一 API 服务，默认 win-x64

可选项目：
  blog, b    -> build/meowv.com
  studio, s  -> build/studio.meowv.com
  livewall, lw -> build/livewall/LiveWall.app
  api, a -> build/studio.meowv.com/api/<RID>/（含 FFmpeg）

选项：
  --with-wallpapers  仅可配合 studio
  --with-dmg         仅可配合 livewall，额外把 .app 打成 DMG，
                     DMG、version.json 与它的签名 version.json.sig
                     输出到 build/studio.meowv.com/data/livewall/
  --rid <RID>        仅可配合 api，默认 win-x64
EOF
}

WITH_WALLPAPERS=0
WITH_DMG=0
API_RID="win-x64"
API_RID_SPECIFIED=0
HAS_STUDIO=0
HAS_API=0
HAS_LIVEWALL=0
LIVEWALL_CATALOG_READY=0

lock_livewall_build() {
  if [ "${LIVEWALL_BUILD_LOCK_HELD:-}" != "$ROOT_DIR" ]; then
    exec /usr/bin/python3 "$ROOT_DIR/tools/with-livewall-build-lock.py" "$ROOT_DIR" \
      "$ROOT_DIR/build.sh" ${ORIGINAL_ARGUMENTS[@]+"${ORIGINAL_ARGUMENTS[@]}"}
  fi
  node "$ROOT_DIR/tools/livewall-artifacts.mjs" recover "$LIVEWALL_PROMOTION_JOURNAL"
}

check_existing_livewall_catalog() {
  local data_dir="$1"
  if [ -e "$data_dir/livewall.json" ]; then
    echo "错误：仍有旧版明文 livewall.json，请先运行 ./build.sh wallpapers 生成加密目录。" >&2
    exit 1
  fi
  if [ -e "$data_dir/livewall" ] || [ -L "$data_dir/livewall" ]; then
    node "$ROOT_DIR/tools/livewall-artifacts.mjs" check "$data_dir/livewall" "$CURRENT_LIVEWALL_KEY_FILE"
  fi
}

prepare_livewall_catalog() {
  resolve_wallpapers_python
  local key_file="$1"
  local rotate="$2"
  local args=("$ROOT_DIR/tools/prepare-livewall-catalog.sh" --key-file "$key_file" --output-dir "$LIVEWALL_STAGE_DIR/catalog")
  [ "$rotate" -eq 1 ] && args+=(--rotate-key)
  "${args[@]}"
  LIVEWALL_CATALOG_READY=1
}

publish_wallpapers_only() {
  local source_dir="$ROOT_DIR/studio/public/data"
  local build_data_dir="$BUILD_DIR/studio.meowv.com/data"

  [ ! -e "$LIVEWALL_STAGE_DIR" ] && [ ! -e "$STAGING_DIR" ] || { echo "错误：暂存目录已存在。" >&2; exit 1; }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  mkdir "$LIVEWALL_STAGE_DIR"
  echo "[wallpapers] 生成并加密 LiveWall 壁纸目录数据..."
  prepare_livewall_catalog "$CURRENT_LIVEWALL_KEY_FILE" 0
  (
    cd "$ROOT_DIR/wallpapers"
    PYTHONPATH=src "$WALLPAPERS_PYTHON" -m wallpapers publish \
      --db "$ROOT_DIR/wallpapers/wallpapers.db" \
      --output-dir "$source_dir"
  )
  node "$ROOT_DIR/studio/scripts/encrypt-wallpaper.mjs" "$source_dir" \
    --key-file "$WALLPAPER_KEY_FILE" --reuse-key

  # 已存在构建产物时同步一份，便于直接部署 build/studio.meowv.com。
  if [ -d "$BUILD_DIR/studio.meowv.com" ]; then
    mkdir -p "$build_data_dir"
    rm -f "$build_data_dir"/wallpapers.catalog.*.bin
    rm -f "$build_data_dir"/wallpapers.catalog.*.json
    cp "$source_dir"/wallpapers.catalog.json "$source_dir"/wallpapers.catalog.*.bin "$build_data_dir"/
    echo "[wallpapers] 加密目录数据已同步到 $build_data_dir"
  fi

  local promotion=("$LIVEWALL_STAGE_DIR/catalog/livewall" "$source_dir/livewall" "-" "$source_dir/livewall.json")
  if [ -d "$BUILD_DIR/studio.meowv.com" ]; then
    stage_livewall_catalog "$build_data_dir/livewall" "$LIVEWALL_STAGE_DIR/deploy-catalog" 0
    promotion+=("$LIVEWALL_STAGE_DIR/deploy-catalog" "$build_data_dir/livewall" "-" "$build_data_dir/livewall.json")
  fi
  node "$ROOT_DIR/tools/livewall-artifacts.mjs" promote --journal "$LIVEWALL_PROMOTION_JOURNAL" "${promotion[@]}"
  echo "[wallpapers] 加密 LiveWall 数据源目录：$source_dir/livewall"
}

stage_livewall_catalog() {
  local previous="$1" destination="$2" rotating="$3"
  mkdir -p "$destination"
  if [ -d "$previous" ]; then cp -R "$previous"/. "$destination"/; fi
  rm -f "$destination"/catalog.json "$destination"/catalog.json.sig \
    "$destination"/category.*.json "$destination"/category.*.bin "$destination"/all.*
  if [ "$rotating" -eq 1 ]; then
    rm -f "$destination"/*.dmg "$destination"/version.json "$destination"/version.json.sig
  fi
  cp "$LIVEWALL_STAGE_DIR/catalog/livewall/"* "$destination/"
}

destination_name() {
  case "$1" in
    blog) echo "meowv.com" ;;
    studio) echo "studio.meowv.com" ;;
    livewall) echo "livewall" ;;
    api) echo "studio.meowv.com/api" ;;
  esac
}

source_path() {
  case "$1" in
    blog) echo "$ROOT_DIR/blog/public" ;;
    studio) echo "$ROOT_DIR/studio/dist" ;;
    livewall) echo "$ROOT_DIR/livewall/build/LiveWall.app" ;;
    api) echo "$ROOT_DIR/api/build/$API_RID" ;;
  esac
}

project_binary() {
  case "$1" in
    blog) echo "$ROOT_DIR/blog/node_modules/.bin/hexo" ;;
    studio) echo "$ROOT_DIR/studio/node_modules/.bin/vite" ;;
    livewall) echo "$ROOT_DIR/livewall/run.sh" ;;
    api) echo "$ROOT_DIR/api/scripts/publish.sh" ;;
  esac
}

install_hint() {
  case "$1" in
    blog) echo "cd blog && yarn install --frozen-lockfile" ;;
    studio) echo "cd studio && pnpm install --frozen-lockfile" ;;
    livewall) echo "cd livewall && ./build.sh" ;;
    api) echo "cd api && dotnet restore" ;;
  esac
}

check_project() {
  local project="$1"
  local binary
  local binaries=()

  if [ "$project" = "livewall" ]; then
    if ! command -v swift >/dev/null 2>&1; then
      echo "错误：未找到 Swift，无法编译 livewall。" >&2
      echo "请先安装 Xcode Command Line Tools。" >&2
      exit 1
    fi
    if ! command -v node >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
      echo "错误：正式 LiveWall 构建还需要 Node.js 与 Python 3 生成加密清单。" >&2
      exit 1
    fi
    if [ ! -x "$ROOT_DIR/tools/prepare-livewall-catalog.sh" ]; then
      echo "错误：LiveWall 清单准备脚本不存在或不可执行。" >&2
      exit 1
    fi
    if [ ! -x "$ROOT_DIR/livewall/build.sh" ]; then
      echo "错误：livewall/build.sh 不存在或不可执行。" >&2
      exit 1
    fi
    return
  fi

  if [ "$project" = "api" ]; then
    if ! command -v dotnet >/dev/null 2>&1; then
      echo "错误：未找到 .NET SDK，无法编译 api。" >&2
      exit 1
    fi
    if [ ! -f "$ROOT_DIR/api/scripts/publish.sh" ]; then
      echo "错误：api 发布脚本不存在。" >&2
      exit 1
    fi
    return
  fi

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
      if [ "$LIVEWALL_CATALOG_READY" -eq 0 ]; then
        check_existing_livewall_catalog "$ROOT_DIR/studio/public/data"
      fi
      (
        cd "$ROOT_DIR/studio"
        ./node_modules/.bin/vue-tsc --noEmit
        ./node_modules/.bin/vite build
      )
      ;;
    livewall)
      (
        cd "$ROOT_DIR/livewall"
        # --bump-build：这里才是发布路径，只有它会递增 CFBundleVersion。
        # 本地运行（`./run.sh lw` → `livewall/run.sh`）不传这个旗标，build 号不动。
        ./build.sh --bump-build
      )
      ;;
    api)
      (
        cd "$ROOT_DIR/api"
        bash ./scripts/publish.sh --rid "$API_RID"
      )
      ;;
  esac
}

stage_output() {
  local project="$1"
  local source
  local destination
  local first_entry
  local api_executable
  local ffmpeg_executable

  if [ "$project" = "api" ]; then
    source="$(source_path "$project")"
    destination="$STAGING_DIR/$(destination_name "$project")"
    api_executable='Meowv.Api'
    ffmpeg_executable='ffmpeg'
    case "$API_RID" in
      win-*) api_executable='Meowv.Api.exe'; ffmpeg_executable='ffmpeg.exe' ;;
    esac

    if [ ! -f "$source/$api_executable" ] || [ ! -f "$source/appsettings.json" ] || [ ! -f "$source/$ffmpeg_executable" ] || [ ! -f "$source/SOURCE.txt" ]; then
      echo "错误：api 编译完成后未找到 $API_RID 主程序、公共配置、FFmpeg 或来源校验记录。" >&2
      exit 1
    fi

    mkdir -p "$destination/$API_RID"
    # 按白名单分发应用、公共配置和 FFmpeg，排除开发密钥、运行数据库及旧构建依赖。
    cp "$source/$api_executable" "$destination/$API_RID/"
    cp "$source/appsettings.json" "$destination/$API_RID/"
    cp "$source/$ffmpeg_executable" "$source/SOURCE.txt" "$destination/$API_RID/"
    echo "[$project] 已暂存到 $(destination_name "$project")/$API_RID/"
    return
  fi

  if [ "$project" = "livewall" ]; then
    source="$LIVEWALL_RELEASE_BUILD_DIR/LiveWall.app"
    destination="$STAGING_DIR/$(destination_name "$project")/LiveWall.app"

    if [ ! -d "$source" ]; then
      echo "错误：$project 编译完成后未找到产物包：$source" >&2
      exit 1
    fi

    # 注意：`destination` 在这一支里是 **App 包本身**（…/livewall/LiveWall.app），
    # 别把别的产物往它里面塞。
    mkdir -p "$destination"
    cp -R "$source"/. "$destination"/
    echo "[$project] 已暂存到 $(destination_name "$project")/LiveWall.app"
    # DMG 与 version.json 不在这里暂存：build/livewall/ 不会被 deploy.sh 上传，
    # 它们由 install_livewall_update_feed 装进 Studio 暂存目录，一起晋升。
    return
  fi

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

  if [ -d "$LIVEWALL_STAGE_DIR" ]; then rm -rf "$LIVEWALL_STAGE_DIR"; fi

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
  local backup_name

  folder="$(destination_name "$project")"
  destination="$BUILD_DIR/$folder"
  backup_name="${folder//\//-}"

  if [ -L "$BUILD_DIR" ]; then
    echo "错误：build 是符号链接，为避免覆盖外部目录，已停止发布。" >&2
    exit 1
  fi

  if [ -e "$BUILD_DIR" ] && [ ! -d "$BUILD_DIR" ]; then
    echo "错误：build 已存在且不是文件夹。" >&2
    exit 1
  fi

  mkdir -p "$BUILD_DIR"
  mkdir -p "$(dirname "$destination")"

  if [ -e "$destination" ] || [ -L "$destination" ]; then
    BACKUP_PATH="$ROOT_DIR/.build-backup.$backup_name.$$"
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

# https://studio.meowv.com/data/livewall/<dmg 文件名>，而 deploy.sh 只上传
# build/studio.meowv.com/ —— 放进 build/livewall/ 等于永远发不出去。
install_livewall_update_feed() {
  local dmg dmg_name feed_path sig_path target_dir

  # dmg 与 version.json 都取自 livewall/make-dmg.sh —— 版本号、文件名、体积、
  # sha256、fileURL 都在那里按 Info.plist 生成，这里只搬运，不另算一份。
  dmg="$(find "$LIVEWALL_RELEASE_BUILD_DIR" -maxdepth 1 -name '*.dmg' -print -quit 2>/dev/null)"
  feed_path="$LIVEWALL_RELEASE_BUILD_DIR/version.json"
  sig_path="${feed_path}.sig"
  target_dir="$STAGING_DIR/studio.meowv.com/data/livewall"

  if [ -z "$dmg" ] || [ ! -f "$feed_path" ]; then
    echo "错误：未找到 make-dmg.sh 产出的 dmg / version.json。" >&2
    exit 1
  fi

  # 签名缺了就直接中止，不部署。客户端只认验签通过的清单，少一个 .sig 的表现是
  # 「新版客户端永远看不到更新」—— 与「线上没发新版」症状完全一样，没有任何别的信号。
  # 与其把一份发不出去的清单推上线，不如在这里停下。
  if [ ! -f "$sig_path" ]; then
    echo "错误：缺少 ${sig_path}，已中止。" >&2
    echo "      version.json 必须与它的签名一起分发。重跑 ./livewall/make-dmg.sh 生成。" >&2
    exit 1
  fi

  dmg_name="$(basename "$dmg")"
  # 两者是同一次产出的，正常必然一致；核一遍挡住手改或半途留下的错配产物。
  if ! grep -q "/${dmg_name}\"" "$feed_path"; then
    echo "错误：version.json 的 fileURL 与本次 DMG（${dmg_name}）不一致，已中止。" >&2
    exit 1
  fi

  mkdir -p "$target_dir"
  # 先清旧版本残留，保证目录里只有本次这一个 dmg、一份 version.json 与它的签名。
  rm -f "$target_dir"/*.dmg
  rm -f "$target_dir"/version.json
  rm -f "$target_dir"/version.json.sig

  cp "$dmg" "$target_dir"/
  cp "$feed_path" "$target_dir"/version.json
  cp "$sig_path" "$target_dir"/version.json.sig
  echo "[livewall] 分发产物：$target_dir/${dmg_name} + version.json + version.json.sig"
}

# Studio 每次都会整体重建部署目录，而 dmg / version.json 是 livewall 的分发产物，
# 不在 studio/dist 里。只构建 studio 时把它们接进暂存区一并带过去 —— 否则一次
# `./build.sh studio` 就会把客户端正在下载的安装包从本地产物里抹掉。
# 带了 --with-dmg 时也不冲突：install_livewall_update_feed 稍后会清掉旧 dmg 再放新的。
preserve_livewall_update_feed() {
  local source_dir="$BUILD_DIR/studio.meowv.com/data/livewall"
  local target_dir="$STAGING_DIR/studio.meowv.com/data/livewall"
  local dmg

  [ -d "$source_dir" ] || return 0

  dmg="$(find "$source_dir" -maxdepth 1 -name '*.dmg' -print -quit 2>/dev/null)"
  [ -n "$dmg" ] || return 0

  mkdir -p "$target_dir"
  cp "$dmg" "$target_dir"/
  if [ -f "$source_dir/version.json" ]; then
    cp "$source_dir/version.json" "$target_dir"/
    # 签名要跟着清单一起搬。只搬清单不搬签名，客户端拿到的就是「有清单、没签名」，
    # 判为不可用 —— 同样表现为「看不到更新」。
    if [ -f "$source_dir/version.json.sig" ]; then
      cp "$source_dir/version.json.sig" "$target_dir"/
    else
      echo "[studio] 警告：$source_dir/version.json 没有配套的 .sig，客户端会因验签不过而看不到更新。" >&2
      echo "[studio]       重跑 ./livewall/make-dmg.sh 可补上（它会在生成清单后立刻签名）。" >&2
    fi
  fi
  echo "[studio] 沿用上次的分发产物 $(basename "$dmg")"
}

# 后端与 Studio 共享部署根目录；仅在本次未构建 API 时沿用其产物。
preserve_api_deployment() {
  [ "$HAS_API" -eq 0 ] || return 0
  local source_dir="$BUILD_DIR/studio.meowv.com/api"
  local target_dir="$STAGING_DIR/studio.meowv.com/api"
  [ -d "$source_dir" ] || return 0
  mkdir -p "$target_dir"
  cp -R "$source_dir"/. "$target_dir"/
  echo "[studio] 沿用上次的 API 服务产物"
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

BUILD_ARGUMENTS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --rid)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        echo "错误：--rid 必须指定 RID。" >&2
        usage >&2
        exit 1
      fi
      API_RID="$2"
      API_RID_SPECIFIED=1
      shift 2
      ;;
    *)
      BUILD_ARGUMENTS+=("$1")
      shift
      ;;
  esac
done
if [ "${#BUILD_ARGUMENTS[@]}" -gt 0 ]; then
  set -- "${BUILD_ARGUMENTS[@]}"
else
  set --
fi

if [ "$#" -eq 0 ] || { [ "$#" -eq 1 ] && [ "$1" = "all" ]; }; then
  SELECTED_PROJECTS=("${ALL_PROJECTS[@]}")
elif [ "$#" -eq 1 ] && { [ "$1" = "-h" ] || [ "$1" = "--help" ]; }; then
  usage
  exit 0
elif [ "$#" -eq 1 ] && { [ "$1" = "wallpapers" ] || [ "$1" = "w" ]; }; then
  lock_livewall_build
  publish_wallpapers_only
  exit 0
else
  for argument in "$@"; do
    case "$argument" in
      --with-wallpapers) WITH_WALLPAPERS=1 ;;
      --with-dmg) WITH_DMG=1 ;;
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
  [ "$project" = "studio" ] && HAS_STUDIO=1
  [ "$project" = "api" ] && HAS_API=1
  [ "$project" = "livewall" ] && HAS_LIVEWALL=1
done

if [ "$HAS_LIVEWALL" -eq 1 ] || [ "$HAS_STUDIO" -eq 1 ]; then lock_livewall_build; fi

if [ "$API_RID_SPECIFIED" -eq 1 ] && [ "$HAS_API" -eq 0 ]; then
  echo "错误：--rid 只能与 api 项目一起使用。" >&2
  exit 1
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

if [ "$WITH_DMG" -eq 1 ]; then
  found_livewall=0
  for project in "${SELECTED_PROJECTS[@]}"; do
    [ "$project" = "livewall" ] && found_livewall=1
  done
  if [ "$found_livewall" -eq 0 ]; then
    echo "错误：--with-dmg 只能与 livewall 项目一起使用。" >&2
    exit 1
  fi
fi

if [ -e "$STAGING_DIR" ] || [ -e "$LIVEWALL_STAGE_DIR" ]; then
  echo "错误：临时目录已存在。" >&2
  exit 1
fi

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir "$STAGING_DIR"

if [ "$HAS_LIVEWALL" -eq 1 ] || [ "$WITH_WALLPAPERS" -eq 1 ]; then
  mkdir "$LIVEWALL_STAGE_DIR"
  if [ "$HAS_LIVEWALL" -eq 1 ]; then
    LIVEWALL_KEY_TEMP="$LIVEWALL_STAGE_DIR/key"
    prepare_livewall_catalog "$LIVEWALL_KEY_TEMP" 1
    export LIVEWALL_CATALOG_KEY_FILE="$LIVEWALL_KEY_TEMP"
    export LIVEWALL_RELEASE_BUILD_DIR="$LIVEWALL_STAGE_DIR/app-build"
  else
    prepare_livewall_catalog "$CURRENT_LIVEWALL_KEY_FILE" 0
  fi
fi

for project in "${SELECTED_PROJECTS[@]}"; do
  if [ "$project" = "studio" ] && [ "$WITH_WALLPAPERS" -eq 1 ]; then
    (
      cd "$ROOT_DIR/wallpapers"
      PYTHONPATH=src "$WALLPAPERS_PYTHON" -m wallpapers publish --db "$ROOT_DIR/wallpapers/wallpapers.db" --output-dir "$ROOT_DIR/studio/public/data"
    )
    node "$ROOT_DIR/studio/scripts/encrypt-wallpaper.mjs" \
      "$ROOT_DIR/studio/public/data" --key-file "$WALLPAPER_KEY_FILE"
  fi
  build_project "$project"
  # DMG 必须在 .app 打完之后生成（make-dmg.sh 打的就是这个包）。
  if [ "$project" = "livewall" ] && [ "$WITH_DMG" -eq 1 ]; then
    (
      cd "$ROOT_DIR/livewall"
      ./make-dmg.sh --no-build
    )
  fi
  stage_output "$project"
  # 分发产物要在 studio 产物拷进暂存区**之后**才补，顺序反了会被覆盖。
  if [ "$project" = "studio" ]; then
    preserve_livewall_update_feed
    if [ "$LIVEWALL_CATALOG_READY" -eq 0 ]; then
      check_existing_livewall_catalog "$STAGING_DIR/studio.meowv.com/data"
    fi
    preserve_api_deployment
  fi
done

# 构建顺序可以是 studio/livewall 任意排列，最后统一覆盖清单并核对 App。
if [ "$LIVEWALL_CATALOG_READY" -eq 1 ]; then
  catalog_target="$STAGING_DIR/studio.meowv.com/data/livewall"
  if [ "$HAS_STUDIO" -eq 1 ]; then
    # 先移走 Vite 拷出的旧目录，避免把旧明文切片带进新产物。
    if [ -d "$catalog_target" ]; then
      mv "$catalog_target" "$LIVEWALL_STAGE_DIR/vite-catalog"
    fi
    previous_catalog="$LIVEWALL_STAGE_DIR/vite-catalog"
  else
    previous_catalog="$BUILD_DIR/studio.meowv.com/data/livewall"
  fi
  stage_livewall_catalog "$previous_catalog" "$catalog_target" "$HAS_LIVEWALL"
  rm -f "$STAGING_DIR/studio.meowv.com/data/livewall.json"
fi
if [ "$WITH_DMG" -eq 1 ]; then install_livewall_update_feed; fi
if [ "$LIVEWALL_CATALOG_READY" -eq 1 ]; then
  node "$ROOT_DIR/tools/livewall-artifacts.mjs" check "$catalog_target" \
    "${LIVEWALL_KEY_TEMP:-$CURRENT_LIVEWALL_KEY_FILE}"
fi

PROMOTION=()
if [ "${#SELECTED_PROJECTS[@]}" -eq "${#ALL_PROJECTS[@]}" ]; then
  PROMOTION+=("$STAGING_DIR" "$BUILD_DIR")
else
  for project in "${SELECTED_PROJECTS[@]}"; do
    if [ "$project" = "api" ] && [ "$HAS_STUDIO" -eq 1 ]; then continue; fi
    folder="$(destination_name "$project")"
    PROMOTION+=("$STAGING_DIR/$folder" "$BUILD_DIR/$folder")
  done
  if [ "$HAS_LIVEWALL" -eq 1 ] && [ "$HAS_STUDIO" -eq 0 ]; then
    PROMOTION+=("$STAGING_DIR/studio.meowv.com/data/livewall" "$BUILD_DIR/studio.meowv.com/data/livewall"
      "-" "$BUILD_DIR/studio.meowv.com/data/livewall.json")
  fi
fi
if [ "$LIVEWALL_CATALOG_READY" -eq 1 ]; then
  PROMOTION+=("$LIVEWALL_STAGE_DIR/catalog/livewall" "$ROOT_DIR/studio/public/data/livewall"
    "-" "$ROOT_DIR/studio/public/data/livewall.json")
fi
if [ "$HAS_LIVEWALL" -eq 1 ]; then
  node "$ROOT_DIR/tools/livewall-artifacts.mjs" check "$LIVEWALL_STAGE_DIR/catalog/livewall" \
    "$LIVEWALL_KEY_TEMP" "$LIVEWALL_RELEASE_BUILD_DIR/LiveWall.app" "$STAGING_DIR/livewall/LiveWall.app"
  cp "$LIVEWALL_RELEASE_BUILD_DIR/Info-LiveWall.plist" "$LIVEWALL_STAGE_DIR/Info-LiveWall.plist"
  PROMOTION+=("$LIVEWALL_RELEASE_BUILD_DIR" "$ROOT_DIR/livewall/build"
    "$LIVEWALL_STAGE_DIR/Info-LiveWall.plist" "$ROOT_DIR/livewall/Resources/Info-LiveWall.plist"
    "$LIVEWALL_KEY_TEMP" "$CURRENT_LIVEWALL_KEY_FILE")
fi
if [ "$LIVEWALL_CATALOG_READY" -eq 1 ]; then
  node "$ROOT_DIR/tools/livewall-artifacts.mjs" promote --journal "$LIVEWALL_PROMOTION_JOURNAL" "${PROMOTION[@]}"
else
  # 无 LiveWall 清单改动的项目沿用原发布逻辑及依赖。
  if [ "${#SELECTED_PROJECTS[@]}" -eq "${#ALL_PROJECTS[@]}" ]; then
    publish_all
  else
    for project in "${SELECTED_PROJECTS[@]}"; do
      if [ "$project" = "api" ] && [ "$HAS_STUDIO" -eq 1 ]; then continue; fi
      publish_one "$project"
    done
    find "$STAGING_DIR" -depth -type d -empty -exec rmdir {} \;
    if [ -d "$STAGING_DIR" ]; then
      echo "错误：发布后临时目录仍有未处理内容：$STAGING_DIR" >&2
      exit 1
    fi
    STAGING_DIR=""
  fi
fi

# 所有晋升成功后才清理暂存；失败由工具恢复旧产物，EXIT 清理剩余暂存。
if [ -d "$STAGING_DIR" ]; then rm -rf "$STAGING_DIR"; fi
if [ -d "$LIVEWALL_STAGE_DIR" ]; then rm -rf "$LIVEWALL_STAGE_DIR"; fi

trap - EXIT INT TERM

echo
echo "编译完成，发布目录：$BUILD_DIR"
for project in "${SELECTED_PROJECTS[@]}"; do
  echo "  $(destination_name "$project")/"
done
if [ "$WITH_DMG" -eq 1 ]; then
  echo "  studio.meowv.com/data/livewall/  # LiveWall-<版本>.dmg + version.json + version.json.sig"
fi
if [ "$HAS_API" -eq 1 ]; then
  echo "  studio.meowv.com/api/$API_RID/（含 FFmpeg）"
fi
