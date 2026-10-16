#!/usr/bin/env bash
# 只编译并验证清单相关 Core 源码，不构建 App 或其他测试模块。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d /private/tmp/livewall-catalog-tests.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
mkdir "$WORK/modules"
SOURCES=()
for name in CatalogCrypto CatalogModel CatalogService CatalogSignature UpdateSignature PrivateFileAccess SynchronousFetch; do
  SOURCES+=("$ROOT/Sources/LiveWallCore/$name.swift")
done
swiftc -module-cache-path "$WORK/modules" -swift-version 6 -emit-library -emit-module \
  -module-name LiveWallCore -emit-module-path "$WORK/LiveWallCore.swiftmodule" \
  -o "$WORK/libLiveWallCore.dylib" "${SOURCES[@]}"
cat > "$WORK/main.swift" <<'SWIFT'
import Foundation
catalogTests()
catalogCryptoTests()
catalogSignatureTests()
privateFileAccessTests()
exit(TestRunner.shared.report())
SWIFT
TESTS=()
for name in Harness CatalogTests CatalogCryptoTests CatalogSignatureTests PrivateFileAccessTests; do
  TESTS+=("$ROOT/Tests/LiveWallCoreTests/$name.swift")
done
LINK=(-module-cache-path "$WORK/modules" -swift-version 6 -I "$WORK" -L "$WORK" -lLiveWallCore -Xlinker -rpath -Xlinker "$WORK")
swiftc "${LINK[@]}" "${TESTS[@]}" "$WORK/main.swift" -o "$WORK/tests"
"$WORK/tests"
swiftc "${LINK[@]}" -parse-as-library "$ROOT/tools/CatalogCryptoProbe.swift" -o "$WORK/probe"
LIVEWALL_CRYPTO_PROBE="$WORK/probe" node --test "$ROOT/tools/catalog-artifacts.test.mjs"
