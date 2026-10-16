#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR=""
DB_PATH="$ROOT_DIR/wallpapers/wallpapers.db"
KEY_FILE=""
ROTATE_KEY=0

usage() {
  cat <<'EOF'
用法：
  tools/prepare-livewall-catalog.sh --key-file PATH --output-dir STAGING_DIR [--rotate-key]
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --key-file)
      KEY_FILE="${2:-}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --rotate-key)
      ROTATE_KEY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "错误：未知参数 $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[ -n "$KEY_FILE" ] || { echo "错误：必须提供 --key-file。" >&2; exit 2; }
[ -n "$OUTPUT_DIR" ] || { echo "错误：必须提供暂存 --output-dir。" >&2; exit 2; }
[ ! -e "$OUTPUT_DIR/livewall" ] || { echo "错误：暂存清单目录已存在。" >&2; exit 1; }
[ -f "$DB_PATH" ] || { echo "错误：数据库不存在：$DB_PATH" >&2; exit 1; }

if [ "$ROTATE_KEY" -eq 0 ]; then
  CURRENT_APPS=()
  for app in "$ROOT_DIR/build/livewall/LiveWall.app" "$ROOT_DIR/livewall/build/LiveWall.app"; do
    [ ! -d "$app" ] || CURRENT_APPS+=("$app")
  done
  node "$ROOT_DIR/tools/livewall-artifacts.mjs" check-key "$KEY_FILE" ${CURRENT_APPS[@]+"${CURRENT_APPS[@]}"}
else
  [ ! -e "$KEY_FILE" ] || { echo "错误：轮换密钥必须写入新的暂存路径。" >&2; exit 1; }
fi
source "$ROOT_DIR/tools/wallpapers-python.sh"
resolve_wallpapers_python
(
  cd "$ROOT_DIR/wallpapers"
  PYTHONPATH=src "$WALLPAPERS_PYTHON" -m wallpapers export-livewall \
    --db "$DB_PATH" \
    --output-dir "$OUTPUT_DIR"
)

ENCRYPT_ARGS=("$ROOT_DIR/livewall/tools/encrypt-catalog.mjs"
  "$OUTPUT_DIR/livewall" --key-file "$KEY_FILE")
[ "$ROTATE_KEY" -eq 1 ] && ENCRYPT_ARGS+=(--rotate-key)
node "${ENCRYPT_ARGS[@]}"

"$ROOT_DIR/livewall/tools/sign-version.swift" sign \
  --json "$OUTPUT_DIR/livewall/catalog.json" \
  --catalog \
  --pubkey-source "$ROOT_DIR/livewall/Sources/LiveWallCore/UpdateSignature.swift"

node "$ROOT_DIR/tools/livewall-artifacts.mjs" check "$OUTPUT_DIR/livewall" "$KEY_FILE"
