import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stageOutput = readFileSync(join(repo, 'build.sh'), 'utf8')
  .split('stage_output() {')[1].split('\ncleanup() {')[0];
const platforms = ['win-x64', 'win-arm64', 'linux-x64', 'linux-arm64', 'osx-x64', 'osx-arm64'];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'api publish layout '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'dotnet'), `#!/bin/bash
set -eu
rid=''
output=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime) rid="$2"; shift 2 ;;
    --output) output="$2"; shift 2 ;;
    *) shift ;;
  esac
done
mkdir -p "$output"
case "$rid" in win-*) name=Meowv.Api.exe ;; *) name=Meowv.Api ;; esac
echo fixture > "$output/$name"
echo '{}' > "$output/appsettings.json"
# 模拟输出目录残留，根打包入口必须继续使用白名单。
echo synthetic > "$output/appsettings.Development.json"
echo synthetic > "$output/api.db"
echo synthetic > "$output/api.db-wal"
`, { mode: 0o755 });
  writeFileSync(join(bin, 'curl'), '#!/bin/bash\nexit 97\n', { mode: 0o755 });
  return { root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

for (const rid of platforms) {
  test(`${rid}：旁置 FFmpeg 可复用，根打包只包含独立平台目录`, t => {
    const { root, env } = fixture(t);
    const output = join(root, 'api/build');
    const platform = join(output, rid);
    mkdirSync(platform, { recursive: true });
    const windows = rid.startsWith('win-');
    const executable = windows ? 'ffmpeg.exe' : 'ffmpeg';
    const binary = Buffer.from('synthetic ffmpeg');
    const hash = createHash('sha256').update(binary).digest('hex');
    writeFileSync(join(platform, executable), binary, { mode: 0o755 });
    writeFileSync(join(platform, 'SOURCE.txt'), `Release: fixture-release\nBinary SHA-256: ${hash}\n`);
    const publish = () => spawnSync('bash', [join(repo, 'api/scripts/publish.sh'),
      '--rid', rid, '--output', output, '--ffmpeg-release', 'fixture-release'], { env, encoding: 'utf8' });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = publish();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /复用已校验/);
      assert.deepEqual(readdirSync(output), [rid]);
    }
    const staged = join(root, 'stage');
    const result = spawnSync('bash', ['-c', `set -eu
source_path() { echo "$ROOT_DIR/api/build/$API_RID"; }
destination_name() { echo api; }
stage_output() {${stageOutput}
stage_output api
`], { env: { ...env, ROOT_DIR: root, STAGING_DIR: staged, API_RID: rid }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(readdirSync(join(staged, 'api')), [rid]);
    assert.deepEqual(readdirSync(join(staged, 'api', rid)).sort(),
      [windows ? 'Meowv.Api.exe' : 'Meowv.Api', 'appsettings.json', executable, 'SOURCE.txt'].sort());
    assert.deepEqual(readFileSync(join(staged, 'api', rid, executable)), binary);
    // 校验失败必须重新准备工具；下载替身拒绝执行，防止错误复用被篡改的二进制。
    writeFileSync(join(platform, executable), 'tampered');
    const invalid = publish();
    assert.notEqual(invalid.status, 0);
    assert.doesNotMatch(invalid.stdout, /复用已校验/);
  });
}

test('--without-ffmpeg 不生成工具目录', t => {
  const { root, env } = fixture(t);
  const output = join(root, 'output');
  const result = spawnSync('bash', [join(repo, 'api/scripts/publish.sh'), '--rid', 'linux-x64',
    '--output', output, '--without-ffmpeg'], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readdirSync(output), ['linux-x64']);
  assert.ok(!readdirSync(join(output, 'linux-x64')).includes('ffmpeg'));
});
