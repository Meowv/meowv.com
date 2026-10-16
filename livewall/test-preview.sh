#!/usr/bin/env bash
# 定向验证 App 层静态图生命周期，所有墙纸设置均替换为测试回调。
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
    echo "用法：bash test-preview.sh  # 定向检查静态图策略、切换与退出；不修改系统墙纸"
    exit 0
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/livewall-preview.XXXXXX")"
trap 'rm -r "${CHECK_DIR}"' EXIT

swiftc -swift-version 6 -module-name LiveWallCore -emit-module -emit-library \
    -emit-module-path "${CHECK_DIR}/LiveWallCore.swiftmodule" \
    -o "${CHECK_DIR}/libLiveWallCore.dylib" \
    -module-cache-path "${CHECK_DIR}/cache" \
    "${ROOT}"/Sources/LiveWallCore/*.swift
swiftc -swift-version 6 -parse-as-library -I "${CHECK_DIR}" -L "${CHECK_DIR}" \
    -lLiveWallCore -Xlinker -rpath -Xlinker "${CHECK_DIR}" \
    -module-cache-path "${CHECK_DIR}/cache" \
    "${ROOT}/Sources/LiveWall/FileDownloader.swift" \
    "${ROOT}/Sources/LiveWall/LockScreenPreviewer.swift" \
    "${ROOT}/Tests/LiveWallAppTests/LockScreenPreviewerTests.swift" \
    -o "${CHECK_DIR}/preview-tests"
"${CHECK_DIR}/preview-tests"
cat > "${CHECK_DIR}/main.swift" <<'SWIFT'
import Foundation
lockScreenPreviewTests()
exit(TestRunner.shared.report())
SWIFT
swiftc -swift-version 6 -I "${CHECK_DIR}" -L "${CHECK_DIR}" \
    -lLiveWallCore -Xlinker -rpath -Xlinker "${CHECK_DIR}" \
    -module-cache-path "${CHECK_DIR}/cache" \
    "${ROOT}/Tests/LiveWallCoreTests/Harness.swift" \
    "${ROOT}/Tests/LiveWallCoreTests/LockScreenPreviewTests.swift" \
    "${CHECK_DIR}/main.swift" -o "${CHECK_DIR}/policy-tests"
"${CHECK_DIR}/policy-tests"
