#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
ALL_PROJECTS=(blog studio livewall)
SELECTED_PROJECTS=()
STAGING_DIR="$ROOT_DIR/.build-staging.$$"
BACKUP_PATH=""
RESTORE_PATH=""
WALLPAPER_KEY_FILE="$ROOT_DIR/.wallpaper-key"

# 内容清单索引的文件名。客户端在 `LivewallCatalog` 里也硬编码了同一个名字
# （它拼的是 `<清单目录>/catalog.json`），改这里必须同时改客户端。
LIVEWALL_CATALOG_NAME="catalog.json"

usage() {
  cat <<'EOF'
用法：
  ./build.sh                 编译全部项目
  ./build.sh all             编译全部项目
  ./build.sh <project> [...] 编译一个或多个指定项目
  ./build.sh studio --with-wallpapers 构建 Studio，并在构建前生成壁纸目录
  ./build.sh wallpapers      只生成 Studio 壁纸目录，不执行项目构建
  ./build.sh livewall --with-dmg 构建 livewall，并额外打出可分发的 DMG

可选项目：
  blog, b    -> build/meowv.com
  studio, s  -> build/studio.meowv.com
  livewall, lw -> build/livewall/LiveWall.app

选项：
  --with-wallpapers  仅可配合 studio
  --with-dmg         仅可配合 livewall，额外把 .app 打成 DMG，
                     DMG、version.json 与它的签名 version.json.sig
                     输出到 build/studio.meowv.com/data/livewall/
EOF
}

WITH_WALLPAPERS=0
WITH_DMG=0

export_livewall_catalog() {
  local output_dir="$1"

  echo "[livewall] 导出壁纸清单..."
  # 旧版单文件清单已废弃，先清掉残留 —— 否则它会随 Studio 一起部署到 CDN，
  # 让还在跑旧版的客户端一直读到过期数据。
  rm -f "$output_dir/livewall.json"
  (
    cd "$ROOT_DIR/wallpapers"
    PYTHONPATH=src python3 -m wallpapers export-livewall \
      --db "$ROOT_DIR/wallpapers/wallpapers.db" \
      --output-dir "$output_dir"
  )
  sign_livewall_catalog "$output_dir/livewall/$LIVEWALL_CATALOG_NAME"
  echo "[livewall] 清单：${output_dir}/livewall"
}

# 对内容清单索引（`catalog.json`）签名，产出 `catalog.json.sig`。
#
# 与 `version.json` 同用一把密钥、同一套签名格式，区别只在**对账对象**：
# 更新清单对账 dmg 的摘要，内容清单对账各分类切片的摘要（切片摘要写在索引里，
# 签名工具用 `--catalog` 走这条路）。
#
# 为什么 **失败就中断、不产出半成品**：客户端只认验签通过的清单 ——
# 少一个 `.sig` 的表现是「客户端拉不到清单、只剩内建兜底」，而这个症状与
# 「线上根本没部署」一模一样，排障会先往 CDN / 网络方向走。宁可这次构建失败。
#
# 顺序约束（只在**首次上线**这次成立）：`.sig` 必须**先于**新客户端被部署出去。
# 新版客户端没有「验不过就用」的降级路，所以先发客户端 = 那批用户启动即无清单。
# 详见 livewall/README.md 的「内容清单签名」。
sign_livewall_catalog() {
  local catalog_path="$1"
  local signer="$ROOT_DIR/livewall/tools/sign-version.swift"
  local pubkey_source="$ROOT_DIR/livewall/Sources/LiveWallCore/UpdateSignature.swift"

  if [ ! -f "$catalog_path" ]; then
    echo "错误：找不到刚导出的内容清单：${catalog_path}" >&2
    exit 1
  fi
  # 逐项前置检查，别让「缺工具」表现得像「签名算法有问题」。
  if [ ! -x "$signer" ]; then
    echo "错误：${signer} 不存在或不可执行。" >&2
    exit 1
  fi
  if [ ! -f "$pubkey_source" ]; then
    echo "错误：找不到客户端公钥源文件：${pubkey_source}" >&2
    exit 1
  fi

  echo "[livewall] 给内容清单签名..."
  # 这一步内部会做两件事：① 逐个校验索引里记的分类切片摘要与磁盘文件一致
  # （挡住「签了一份指向旧/坏切片的索引」）② 签完用**客户端内嵌公钥**回验。
  "$signer" sign --json "$catalog_path" --catalog --pubkey-source "$pubkey_source"
}

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
  export_livewall_catalog "$source_dir"
  node "$ROOT_DIR/studio/scripts/encrypt-wallpaper.mjs" "$source_dir" \
    --key-file "$WALLPAPER_KEY_FILE" --reuse-key

  # 已存在构建产物时同步一份，便于直接部署 build/studio.meowv.com。
  if [ -d "$BUILD_DIR/studio.meowv.com" ]; then
    mkdir -p "$build_data_dir"
    rm -f "$build_data_dir"/wallpapers.catalog.*.bin
    rm -f "$build_data_dir"/wallpapers.catalog.*.json
    # 旧版单文件清单已废弃，清掉避免残留；新产物是 livewall/ 整个目录
    rm -f "$build_data_dir/livewall.json"
    # 只清清单文件：`version.json` 是 --with-dmg 写入的分发产物，不能跟着一起删。
    rm -f "$build_data_dir"/livewall/catalog.json
    # 签名必须**跟着清单一起清**。留着一份旧清单的 .sig，新清单就会配着旧签名被部署出去，
    # 客户端一律判「签名与清单不符」—— 比「没有签名」更难看出原因。
    rm -f "$build_data_dir"/livewall/catalog.json.sig
    rm -f "$build_data_dir"/livewall/category.*.json
    mkdir -p "$build_data_dir/livewall"
    cp \
      "$source_dir"/wallpapers.catalog.json \
      "$source_dir"/wallpapers.catalog.*.bin \
      "$build_data_dir"/
    cp "$source_dir"/livewall/*.json "$build_data_dir/livewall"/
    # `*.json` **匹配不到** `.json.sig`，签名要单独拷。漏了它的表现是
    # 「部署出去的清单客户端一律拒用」，而本地 studio/public/data 下看着是齐的 ——
    # 所以这里缺文件就报错，不静默跳过。
    if [ ! -f "$source_dir/livewall/${LIVEWALL_CATALOG_NAME}.sig" ]; then
      echo "错误：${source_dir}/livewall/${LIVEWALL_CATALOG_NAME}.sig 不存在，内容清单没有签名。" >&2
      echo "      它由 export_livewall_catalog 调 livewall/tools/sign-version.swift 产出。" >&2
      exit 1
    fi
    cp "$source_dir"/livewall/*.json.sig "$build_data_dir/livewall"/
    echo "[wallpapers] 加密目录数据已同步到 $build_data_dir"
  fi

  echo "[wallpapers] JSON 数据源目录：$source_dir"
}

destination_name() {
  case "$1" in
    blog) echo "meowv.com" ;;
    studio) echo "studio.meowv.com" ;;
    livewall) echo "livewall" ;;
  esac
}

source_path() {
  case "$1" in
    blog) echo "$ROOT_DIR/blog/public" ;;
    studio) echo "$ROOT_DIR/studio/dist" ;;
    livewall) echo "$ROOT_DIR/livewall/build/LiveWall.app" ;;
  esac
}

project_binary() {
  case "$1" in
    blog) echo "$ROOT_DIR/blog/node_modules/.bin/hexo" ;;
    studio) echo "$ROOT_DIR/studio/node_modules/.bin/vite" ;;
    livewall) echo "$ROOT_DIR/livewall/run.sh" ;;
  esac
}

install_hint() {
  case "$1" in
    blog) echo "cd blog && yarn install --frozen-lockfile" ;;
    studio) echo "cd studio && pnpm install --frozen-lockfile" ;;
    livewall) echo "cd livewall && ./build.sh" ;;
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
    if [ ! -x "$ROOT_DIR/livewall/build.sh" ]; then
      echo "错误：livewall/build.sh 不存在或不可执行。" >&2
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
  esac
}

stage_output() {
  local project="$1"
  local source
  local destination
  local first_entry

  if [ "$project" = "livewall" ]; then
    source="$(source_path "$project")"
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
    # 它们由 install_livewall_update_feed 在发布之后装进 studio 的部署目录。
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

# 清掉 livewall 上一次的分发产物。make-dmg.sh 只删「当前版本那一个」dmg，
# 旧版本的 dmg 会一直留在 livewall/build/ 里，看着像本次产物。
clean_livewall_dmg_artifacts() {
  rm -f "$ROOT_DIR"/livewall/build/*.dmg
  # 签名必须跟着清单一起清。留下一份**旧清单的** .sig，新清单就会配着旧签名被打包出去，
  # 客户端那边表现为「签名与版本信息不符」—— 比「没有签名」更难看出原因。
  rm -f "$ROOT_DIR"/livewall/build/version.json.sig
  # ⚠️ 故意**不删** version.json：它是 make-dmg.sh 递增校验的**兜底参照物**
  # （首选是 studio 部署目录里那一份）。在这里删掉，等于让校验在 studio 部署目录
  # 缺失时静默退化成「跳过」，而症状只表现为一行提示，很难联想到是本行删的。
  # 不删也不会把旧清单当成本次产物：dmg 已被上面清掉，install_livewall_update_feed
  # 找不到 dmg 就会中止，且它还会核对 version.json 的 fileURL 与 dmg 文件名是否一致。
}

# DMG 与 version.json 必须落在 Studio 的部署目录里：version.json 的 fileURL 写死了
# https://studio.meowv.com/data/livewall/<dmg 文件名>，而 deploy.sh 只上传
# build/studio.meowv.com/ —— 放进 build/livewall/ 等于永远发不出去。
install_livewall_update_feed() {
  local dmg dmg_name feed_path sig_path target_dir

  # dmg 与 version.json 都取自 livewall/make-dmg.sh —— 版本号、文件名、体积、
  # sha256、fileURL 都在那里按 Info.plist 生成，这里只搬运，不另算一份。
  dmg="$(find "$ROOT_DIR/livewall/build" -maxdepth 1 -name '*.dmg' -print -quit 2>/dev/null)"
  feed_path="$ROOT_DIR/livewall/build/version.json"
  sig_path="${feed_path}.sig"
  target_dir="$BUILD_DIR/studio.meowv.com/data/livewall"

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
      --with-dmg) WITH_DMG=1 ;;
      blog | b) add_project "blog" ;;
      studio | s) add_project "studio" ;;
      livewall | lw) add_project "livewall" ;;
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
    export_livewall_catalog "$ROOT_DIR/studio/public/data"
    node "$ROOT_DIR/studio/scripts/encrypt-wallpaper.mjs" \
      "$ROOT_DIR/studio/public/data" --key-file "$WALLPAPER_KEY_FILE"
  fi
  build_project "$project"
  # DMG 必须在 .app 打完之后生成（make-dmg.sh 打的就是这个包）。
  if [ "$project" = "livewall" ] && [ "$WITH_DMG" -eq 1 ]; then
    # 先清掉上一次的 dmg / version.json，避免旧版本文件被当成本次产物。
    clean_livewall_dmg_artifacts
    (
      cd "$ROOT_DIR/livewall"
      ./make-dmg.sh --no-build
    )
  fi
  stage_output "$project"
  # 分发产物要在 studio 产物拷进暂存区**之后**才补，顺序反了会被覆盖。
  if [ "$project" = "studio" ]; then
    preserve_livewall_update_feed
  fi
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

# 发布之后才装分发产物：publish_all / publish_one 都会整体替换对应目录，装早了会被覆盖。
if [ "$WITH_DMG" -eq 1 ]; then
  install_livewall_update_feed
fi

trap - EXIT INT TERM

echo
echo "编译完成，发布目录：$BUILD_DIR"
for project in "${SELECTED_PROJECTS[@]}"; do
  echo "  $(destination_name "$project")/"
done
if [ "$WITH_DMG" -eq 1 ]; then
  echo "  studio.meowv.com/data/livewall/  # LiveWall-<版本>.dmg + version.json + version.json.sig"
fi
