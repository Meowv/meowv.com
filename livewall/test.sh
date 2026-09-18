#!/usr/bin/env bash
# 运行 LiveWallCore 的单元测试。
#
# 测试用 executableTarget + 自建断言运行器实现，而不是 XCTest ——
# 本机只装了 Command Line Tools，没有 Xcode，XCTest 与 Swift Testing 都不可用。
# 详见 Package.swift 顶部说明。
#
# 退出码：全部通过为 0，存在失败为 1（可直接用于 CI 或 git hook）。
#
# 用法：
#   ./test.sh              跑全部测试
#   ./test.sh --verbose    显示 SwiftPM 的完整输出（默认会过滤编译噪音）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERBOSE=0

if [[ "${1:-}" == "--verbose" ]]; then
  VERBOSE=1
fi

cd "$ROOT"

# 用临时文件而不是管道：管道会把 swift run 的退出码和 grep 的退出码混在一起，
# 且 pipefail 下「grep 没匹配到任何行」也会让整体判为失败。
LOG="$(mktemp)"
set +e
swift run LiveWallCoreTests >"$LOG" 2>&1
STATUS=$?
set -e

if [[ "$VERBOSE" -eq 1 ]]; then
  cat "$LOG"
else
  # 过滤 SwiftPM 的编译噪音与 CLT 环境下必然出现的 ld 警告
  grep -vE "^\[[0-9]+/[0-9]+\]|^Building for|^Compiling|^Planning|^Build complete|ld: warning: search path" "$LOG" || true
fi
rm -f "$LOG"

exit "$STATUS"
