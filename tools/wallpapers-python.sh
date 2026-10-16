#!/usr/bin/env bash
# 供根构建和独立清单准备入口共用；不安装或修改系统 Python。
resolve_wallpapers_python() {
  local candidate
  local candidates=()
  if [ -n "${WALLPAPERS_PYTHON:-}" ]; then
    candidates=("$WALLPAPERS_PYTHON")
  else
    candidates=(python3 python3.12 python3.13 python3.14 python3.15)
  fi
  for candidate in "${candidates[@]}"; do
    if command -v "$candidate" >/dev/null 2>&1 &&
       "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' >/dev/null 2>&1; then
      WALLPAPERS_PYTHON="$(command -v "$candidate")"
      export WALLPAPERS_PYTHON
      return
    fi
  done
  echo "错误：壁纸导出需要 Python >=3.12；可用 WALLPAPERS_PYTHON 指定已有解释器。" >&2
  return 1
}
