#!/usr/bin/env bash
# 仅编译 Core 并运行备份相关用例，不构建 App 或运行全量测试。
set -euo pipefail
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "用法：bash tools/test-backup.sh（备份专项测试与 App 静态类型检查）"
  exit 0
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d /private/tmp/livewall-backup-tests.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
mkdir "$WORK/modules"
swiftc -module-cache-path "$WORK/modules" -swift-version 6 -enable-testing -emit-library -emit-module \
  -module-name LiveWallCore -emit-module-path "$WORK/LiveWallCore.swiftmodule" \
  -o "$WORK/libLiveWallCore.dylib" "$ROOT"/Sources/LiveWallCore/*.swift
cat > "$WORK/main.swift" <<'SWIFT'
import Foundation
wallpaperLibraryTests()
backupTests()
singleInstanceTests()
exit(TestRunner.shared.report())
SWIFT
swiftc -module-cache-path "$WORK/modules" -swift-version 6 -I "$WORK" -L "$WORK" -lLiveWallCore \
  -Xlinker -rpath -Xlinker "$WORK" \
  "$ROOT/Tests/LiveWallCoreTests/Harness.swift" "$ROOT/Tests/LiveWallCoreTests/WallpaperLibraryTests.swift" \
  "$ROOT/Tests/LiveWallCoreTests/SingleInstanceTests.swift" \
  "$ROOT/Tests/LiveWallCoreTests/BackupTests.swift" "$WORK/main.swift" -o "$WORK/tests"
"$WORK/tests"
# 静态类型检查 App 层与 Swift 6 隔离边界，不链接或组装 App。
swiftc -module-cache-path "$WORK/modules" -swift-version 6 -I "$WORK" -emit-module \
  -module-name LiveWallDesktop -emit-module-path "$WORK/LiveWallDesktop.swiftmodule" \
  "$ROOT"/Sources/LiveWallDesktop/*.swift
swiftc -module-cache-path "$WORK/modules" -swift-version 6 -I "$WORK" -typecheck "$ROOT"/Sources/LiveWall/*.swift
