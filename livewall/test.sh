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
#
# 受限环境（某些沙箱 / CI）里 SwiftPM 自己的 `sandbox-exec` 会嵌套失败，
# 报 `sandbox_apply: Operation not permitted`。那时这样绕过：
#   SWIFT_BUILD_FLAGS="--disable-sandbox --manifest-cache none" ./test.sh
# 默认**不**加这些旗标 —— 正常环境该保留沙箱保护。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERBOSE=0

if [[ "${1:-}" == "--verbose" ]]; then
  VERBOSE=1
fi

cd "$ROOT"

# ── 登记自检 ────────────────────────────────────────────
# 运行器是 executableTarget + 手写 `main.swift`，每个测试文件必须在 `main.swift` 里
# **手工**加一行调用。漏登记时编译通过、测试全绿，而那个文件一行都没跑 ——
# 这里把它变成硬失败，并直接点出漏了哪一个。
#
# 比的是**函数名**而不是文件数：一个文件里定义两个测试函数是合法的
# （`LockScreenPreviewTests.swift` 历史上就装着两个）。
DEFINED_NAMES="$(grep -hoE '^func [A-Za-z_][A-Za-z0-9_]*Tests\(\)' Tests/LiveWallCoreTests/*.swift \
  | sed 's/^func //; s/()$//' | sort -u || true)"

if [[ -z "${DEFINED_NAMES}" ]]; then
  echo "错误：没能从 Tests/LiveWallCoreTests/*.swift 里读出任何测试函数。" >&2
  echo "      （glob 没匹配到文件、或 grep 不可用 —— 两种情况都该让测试跑不起来，而不是静默通过。）" >&2
  exit 1
fi

UNREGISTERED=""
while IFS= read -r name; do
  [[ -z "${name}" ]] && continue
  grep -q "^${name}()\$" Tests/LiveWallCoreTests/main.swift || UNREGISTERED="${UNREGISTERED}  ${name}\n"
done <<< "${DEFINED_NAMES}"

if [[ -n "${UNREGISTERED}" ]]; then
  echo "错误：以下测试函数没有在 main.swift 里登记（会编译通过，但一行都不跑）：" >&2
  printf '%b' "${UNREGISTERED}" >&2
  exit 1
fi

REGISTERED_COUNT="$(printf '%s\n' "${DEFINED_NAMES}" | wc -l | tr -d ' ')"
echo "[test] 登记自检通过：${REGISTERED_COUNT} 个测试函数全部已登记"

# ── 跑测试 ──────────────────────────────────────────────
# 用临时文件而不是管道：管道会把 swift run 的退出码和 grep 的退出码混在一起，
# 且 pipefail 下「grep 没匹配到任何行」也会让整体判为失败。
LOG="$(mktemp)"
set +e
if [[ -n "${SWIFT_BUILD_FLAGS:-}" ]]; then
  # 故意不加引号：这里就是要让 shell 按空白拆成多个旗标。
  # shellcheck disable=SC2086
  swift run ${SWIFT_BUILD_FLAGS} LiveWallCoreTests >"$LOG" 2>&1
else
  swift run LiveWallCoreTests >"$LOG" 2>&1
fi
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
