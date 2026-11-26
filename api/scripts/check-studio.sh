#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
project_dir=$(cd "$script_dir/.." && pwd)
host_project="$project_dir/src/Meowv.Api/Meowv.Api.csproj"
content_root="$project_dir/src/Meowv.Api"
port=${PORT:-5099}
base="http://127.0.0.1:$port"
bootstrap='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/meowv-studio-check.XXXXXX")
db="$work_dir/studio.db"
assets="$work_dir/assets"
app_log="$work_dir/app.log"
app_pid=''

cleanup() {
  if [ -n "$app_pid" ]; then kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT

if [ "${1:-}" = '--help' ] || [ "${1:-}" = '-h' ]; then
  echo '用法：scripts/check-studio.sh；使用临时 SQLite 与端口验证 Studio 初始化、登录、布局 CAS、错误体与限流，不构建完整解决方案。'
  exit 0
fi

fail() { echo "FAIL: $*" >&2; echo "log: $app_log" >&2; exit 1; }
expect_code() {
  actual=$1; expected=$2; label=$3
  [ "$actual" = "$expected" ] || fail "$label expected HTTP $expected, got $actual"
}

dotnet build "$host_project" -c Release -v quiet >/dev/null

ConnectionStrings__DefaultConnection="Data Source=$db" \
Modules__Studio__AvatarDirectory="$assets" \
Modules__Studio__RegistrationEnabled=true \
Modules__Studio__RequireEmailVerification=false \
Security__BootstrapToken="$bootstrap" \
dotnet run -c Release --project "$host_project" --no-build -- \
  --contentRoot "$content_root" --urls "$base" >"$app_log" 2>&1 &
app_pid=$!

ready=0
for _ in $(seq 1 60); do
  if curl -fsS "$base/api/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.5
done
[ "$ready" = 1 ] || fail 'API did not become ready'

expect_code "$(curl -s -o /dev/null -w '%{http_code}' "$base/api/health")" 200 'health'
expect_code "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/api/studio/setup/admin" -H 'Content-Type: application/json' -H "X-Api-Bootstrap-Token: $bootstrap" --data '{"username":"admin","email":"admin@example.com","password":"AdminPass1234"}')" 201 'setup admin'
expect_code "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/api/studio/setup/admin" -H 'Content-Type: application/json' -H "X-Api-Bootstrap-Token: $bootstrap" --data '{"username":"admin2","email":"admin2@example.com","password":"AdminPass1234"}')" 409 'setup admin twice'

login_body="$work_dir/login.json"
expect_code "$(curl -s -o "$login_body" -w '%{http_code}' -X POST "$base/api/studio/auth/login" -H 'Content-Type: application/json' --data '{"identifier":"admin","password":"AdminPass1234"}')" 200 'login'
token=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["token"])' "$login_body")

expect_code "$(curl -s -o "$work_dir/layout.json" -w '%{http_code}' "$base/api/studio/layout" -H "Authorization: Bearer $token")" 200 'layout get'
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["exists"] is False and d["revision"]==0, d' "$work_dir/layout.json" || fail 'empty layout envelope'

layout_body='{"layout":{"pages":[[]],"dock":[]},"revision":0}'
expect_code "$(curl -s -o "$work_dir/e1.json" -w '%{http_code}' -X PUT "$base/api/studio/layout" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data "$layout_body")" 400 'layout without If-Match'
expect_code "$(curl -s -o "$work_dir/saved.json" -w '%{http_code}' -X PUT "$base/api/studio/layout" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -H 'If-Match: "layout-0"' --data "$layout_body")" 200 'layout create'
expect_code "$(curl -s -o "$work_dir/conflict.json" -w '%{http_code}' -X PUT "$base/api/studio/layout" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -H 'If-Match: "layout-0"' --data "$layout_body")" 409 'layout stale revision'
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["code"]=="revision_conflict" and "request_id" in d and d["current"]["revision"]==1, d' "$work_dir/conflict.json" || fail 'conflict envelope'

expect_code "$(curl -s -o "$work_dir/unauthorized.json" -w '%{http_code}' "$base/api/studio/admin/stats")" 401 'anonymous admin'
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["code"]=="unauthorized" and "request_id" in d, d' "$work_dir/unauthorized.json" || fail 'unauthorized envelope'

admin_id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["user"]["id"])' "$login_body")
expect_code "$(curl -s -o "$work_dir/last-admin.json" -w '%{http_code}' -X PUT "$base/api/studio/admin/users/$admin_id/role" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data '{"role":"user"}')" 409 'last admin demote'
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["code"]=="last_admin", d' "$work_dir/last-admin.json" || fail 'last admin code'

python3 - "$work_dir/big.json" <<'PY'
import json,sys
payload={"revision":0,"layout":{"pages":[[{"id":"a","type":"link","title":"x"*3000000,"url":"https://example.com"}]],"dock":[]}}
open(sys.argv[1],'w').write(json.dumps(payload))
PY
expect_code "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$base/api/studio/layout" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -H 'If-Match: "layout-1"' --data-binary "@$work_dir/big.json")" 413 'layout body limit'

curl -s "$base/api/modules" >"$work_dir/modules.json"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert any(m["name"]=="studio" for m in d), "studio module missing"' "$work_dir/modules.json" || fail 'module catalog'

expect_code "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/api/studio/auth/logout" -H "Authorization: Bearer $token")" 200 'logout'
expect_code "$(curl -s -o /dev/null -w '%{http_code}' "$base/api/studio/user/profile" -H "Authorization: Bearer $token")" 401 'revoked session'

for i in 1 2 3 4; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/api/studio/auth/login" -H 'Content-Type: application/json' --data '{"identifier":"nobody","password":"wrong-pass"}')
done
expect_code "$code" 429 'login throttle'

echo 'OK: studio checks passed'
