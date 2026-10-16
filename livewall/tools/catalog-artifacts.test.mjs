import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCipheriv, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, renameSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { encryptCatalogDirectory, keyID } from './encrypt-catalog.mjs';
import { checkCatalog, checkAppKey, promote } from '../../tools/livewall-artifacts.mjs';

function fixture(t) {
  const root = mkdtempSync('/private/tmp/livewall-artifacts-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const key = join(root, 'key');
  writeFileSync(key, `${Buffer.alloc(32, 0x41).toString('base64')}\n`);
  function catalog(name) {
    const dir = join(root, name);
    mkdirSync(dir);
    const slice = { schemaVersion: 1, generatedAt: 'fixture', source: { deviceType: 'desktop', contentType: 'dynamic', categoryIds: [1] },
      items: [{ id: 1, title: 'fixture', author: '', url: 'https://example.test/test.mp4', tags: [], categoryIds: [1] }] };
    writeFileSync(join(dir, 'category.1.json'), JSON.stringify(slice));
    writeFileSync(join(dir, 'all.json'), JSON.stringify(slice));
    writeFileSync(join(dir, 'catalog.json'), JSON.stringify({ schemaVersion: 1, generatedAt: 'fixture', source: slice.source,
      categories: [{ id: 1, name: 'fixture', file: 'category.1.json', itemCount: 1 }], allSlice: { file: 'all.json', itemCount: 1 } }));
    return dir;
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicSource = join(root, 'PublicKey.swift');
  writeFileSync(publicSource, `public static let publicKeyBase64 = "${publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')}"`);
  function signIndex(dir) {
    writeFileSync(join(dir, 'catalog.json.sig'), JSON.stringify({ schemaVersion: 1, alg: 'ed25519',
      signature: sign(null, readFileSync(join(dir, 'catalog.json')), privateKey).toString('base64') }));
  }
  return { root, key, catalog, signIndex, publicSource };
}

test('沿用和轮换均生成密文切片，且 App、索引密钥一致', t => {
  const f = fixture(t);
  const reused = f.catalog('reuse');
  const before = readFileSync(f.key);
  const manifest = encryptCatalogDirectory(reused, { keyFile: f.key });
  assert.equal(manifest.keyID, keyID(Buffer.alloc(32, 0x41)));
  assert.deepEqual(readFileSync(f.key), before);
  assert.ok(readdirSync(reused).every(name => name === 'catalog.json' || name.endsWith('.bin')));
  const app = join(f.root, 'LiveWall.app');
  mkdirSync(join(app, 'Contents/Resources'), { recursive: true });
  writeFileSync(join(app, 'Contents/Resources/livewall-catalog-key.txt'), before);
  f.signIndex(reused);
  checkCatalog(reused, f.key, [app], f.publicSource);
  assert.throws(() => checkAppKey(f.key, []));

  const rotated = f.catalog('rotate');
  const nextKey = join(f.root, 'next-key');
  const next = encryptCatalogDirectory(rotated, { keyFile: nextKey, rotateKey: true });
  assert.notEqual(next.keyID, manifest.keyID);
  f.signIndex(rotated);
  checkCatalog(rotated, nextKey, [], f.publicSource);
  assert.throws(() => checkCatalog(rotated, f.key, [], f.publicSource));
  assert.throws(() => checkAppKey(nextKey, [app]));
  assert.throws(() => encryptCatalogDirectory(f.catalog('overwrite'), { keyFile: f.key, rotateKey: true }));
  assert.deepEqual(readFileSync(f.key), before);
});

test('篡改、摘要不符、签名缺失及明文残留均拒绝', t => {
  const f = fixture(t);
  const dir = f.catalog('tamper');
  const index = encryptCatalogDirectory(dir, { keyFile: f.key });
  f.signIndex(dir);
  const path = join(dir, index.allSlice.file);
  const original = readFileSync(path);
  const changed = Buffer.from(original);
  changed[changed.length - 1] ^= 1;
  writeFileSync(path, changed);
  assert.throws(() => checkCatalog(dir, f.key, [], f.publicSource));
  index.allSlice.sha256 = createHash('sha256').update(changed).digest('hex');
  writeFileSync(join(dir, 'catalog.json'), JSON.stringify(index));
  f.signIndex(dir);
  assert.throws(() => checkCatalog(dir, f.key, [], f.publicSource));
  writeFileSync(path, original);
  index.allSlice.sha256 = createHash('sha256').update(original).digest('hex');
  writeFileSync(join(dir, 'catalog.json'), JSON.stringify(index));
  f.signIndex(dir);
  writeFileSync(join(dir, 'all.json'), '{}');
  assert.throws(() => checkCatalog(dir, f.key, [], f.publicSource));
  rmSync(join(dir, 'all.json'));
  rmSync(join(dir, 'catalog.json.sig'));
  assert.throws(() => checkCatalog(dir, f.key, [], f.publicSource));
});

test('晋升失败恢复全部旧产物及旧密钥，成功才替换', t => {
  const f = fixture(t);
  const pairs = ['App', 'catalog', 'key'].map(name => {
    const source = join(f.root, `new-${name}`), target = join(f.root, `old-${name}`);
    writeFileSync(source, `new-${name}`);
    writeFileSync(target, `old-${name}`);
    return [source, target];
  });
  let moves = 0;
  assert.throws(() => promote(pairs, (from, to) => {
    if (++moves === 6) throw new Error('fixture: key promotion failed');
    renameSync(from, to);
  }));
  for (const [, target] of pairs) assert.equal(readFileSync(target, 'utf8'), target.split('/').at(-1));
  for (const [source] of pairs) writeFileSync(source, 'promoted');
  promote(pairs);
  for (const [, target] of pairs) assert.equal(readFileSync(target, 'utf8'), 'promoted');
  assert.ok(!readdirSync(f.root).some(name => name.includes('.livewall-backup.')));
});

test('根发布入口：构建失败不换钥、不改旧产物；成功同步 App 与目录；目录更新沿用密钥', t => {
  const f = fixture(t);
  const repo = join(f.root, 'repo');
  function put(path, content, executable = false) {
    const file = join(repo, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
    if (executable) chmodSync(file, 0o755);
  }
  for (const path of ['build.sh', 'tools/prepare-livewall-catalog.sh', 'tools/with-livewall-build-lock.py', 'tools/wallpapers-python.sh', 'tools/livewall-artifacts.mjs', 'livewall/tools/encrypt-catalog.mjs']) {
    put(path, readFileSync(new URL(`../../${path}`, import.meta.url)), true);
  }
  put('livewall/Sources/LiveWallCore/UpdateSignature.swift', readFileSync(f.publicSource));
  put('wallpapers/wallpapers.db', 'fixture');
  put('.livewall-key', readFileSync(f.key));
  put('livewall/Resources/Info-LiveWall.plist', 'fixture-plist');
  for (const app of ['livewall/build/LiveWall.app', 'build/livewall/LiveWall.app']) {
    put(`${app}/Contents/Resources/livewall-catalog-key.txt`, readFileSync(f.key));
    put(`${app}/old-marker`, 'previous-app');
  }
  put('studio/public/data/livewall/catalog.json', 'previous-catalog');
  put('studio/public/data/livewall.json', 'previous-legacy');
  put('build/studio.meowv.com/data/livewall/catalog.json', 'previous-deploy');
  put('build/studio.meowv.com/data/livewall.json', 'previous-legacy');
  put('build/studio.meowv.com/data/livewall/version.json', 'previous-version');
  put('build/studio.meowv.com/data/livewall/LiveWall-0.1.0.dmg', 'previous-dmg');
  // 项目构建使用替身；真实根脚本、准备、加密、验签和晋升逻辑照常执行。
  put('livewall/build.sh', `#!/bin/bash
set -eu
[ "\${FIXTURE_BUILD_FAIL:-0}" != 1 ] || exit 7
mkdir -p "$LIVEWALL_RELEASE_BUILD_DIR/LiveWall.app/Contents/Resources"
cp "$LIVEWALL_CATALOG_KEY_FILE" "$LIVEWALL_RELEASE_BUILD_DIR/LiveWall.app/Contents/Resources/livewall-catalog-key.txt"
cp Resources/Info-LiveWall.plist "$LIVEWALL_RELEASE_BUILD_DIR/Info-LiveWall.plist"
`, true);
  put('fixture-sign.mjs', `import {writeFileSync,readFileSync} from 'node:fs';
import {createPrivateKey,sign} from 'node:crypto';
const args=process.argv.slice(2), path=args[args.indexOf('--json')+1];
const privateKey=createPrivateKey({key:Buffer.from(process.env.FIXTURE_SIGNING_KEY,'base64'),format:'der',type:'pkcs8'});
writeFileSync(path+'.sig',JSON.stringify({schemaVersion:1,alg:'ed25519',signature:sign(null,readFileSync(path),privateKey).toString('base64')}));`);
  put('livewall/tools/sign-version.swift', '#!/bin/bash\n[ "${FIXTURE_SIGN_FAIL:-0}" != 1 ] || exit 9\nexec node "$FIXTURE_REPO/fixture-sign.mjs" "$@"\n', true);
  put('bin/python3', `#!/bin/bash
[ "\${1:-}" != -c ] || exit 0
exec node "$FIXTURE_REPO/fixture-export.mjs" "$@"
`, true);
  put('fixture-export.mjs', `import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const args=process.argv.slice(2), output=args[args.indexOf('--output-dir')+1];
if(args.includes('publish')) { mkdirSync(output,{recursive:true});process.exit(0); }
const dir=join(output,'livewall');mkdirSync(dir,{recursive:true});
const slice={schemaVersion:1,generatedAt:'fixture',source:{deviceType:'desktop',contentType:'dynamic',categoryIds:[1]},items:[{id:1,title:'fixture',author:'',url:'https://example.test/test.mp4',tags:[],categoryIds:[1]}]};
writeFileSync(join(dir,'category.1.json'),JSON.stringify(slice));
writeFileSync(join(dir,'catalog.json'),JSON.stringify({schemaVersion:1,generatedAt:'fixture',source:slice.source,categories:[{id:1,name:'fixture',file:'category.1.json',itemCount:1}]}));`);
  put('studio/scripts/encrypt-wallpaper.mjs', `import {writeFileSync} from 'node:fs';
writeFileSync(process.argv[2]+'/wallpapers.catalog.json','{}');
writeFileSync(process.argv[2]+'/wallpapers.catalog.fixture.bin','fixture');`);
  put('studio/node_modules/.bin/vue-tsc', '#!/bin/bash\nexit 0\n', true);
  put('studio/node_modules/.bin/vite', '#!/bin/bash\nmkdir -p dist/data\ncp -R public/data/livewall dist/data/\n', true);
  put('livewall/make-dmg.sh', `#!/bin/bash
set -eu
[ "\${FIXTURE_DMG_FAIL:-0}" != 1 ] || exit 8
node "$FIXTURE_REPO/fixture-dmg.mjs"
node "$FIXTURE_REPO/fixture-sign.mjs" --json "$LIVEWALL_RELEASE_BUILD_DIR/version.json"
`, true);
  put('fixture-dmg.mjs', `import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=process.env.LIVEWALL_RELEASE_BUILD_DIR, bytes=Buffer.from('fixture-dmg');
writeFileSync(dir+'/LiveWall-1.0.0.dmg',bytes);
writeFileSync(dir+'/version.json',JSON.stringify({build:2,fileURL:'https://example.test/LiveWall-1.0.0.dmg',sha256:createHash('sha256').update(bytes).digest('hex')}));`);
  put('blog/node_modules/.bin/hexo', '#!/bin/bash\nmkdir -p public\necho fixture > public/index.html\n', true);
  put('bin/dotnet', '#!/bin/bash\nexit 0\n', true);
  put('xiaomiCamera/scripts/publish.sh', '#!/bin/bash\nmkdir -p build/win-x64 build/tools/ffmpeg/win-x64\necho fixture > build/win-x64/XiaomiCamera.exe\necho fixture > build/tools/ffmpeg/win-x64/fixture\n', true);
  const signing = generateKeyPairSync('ed25519');
  put('livewall/Sources/LiveWallCore/UpdateSignature.swift', `public static let publicKeyBase64 = "${signing.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')}"`);
  const env = { ...process.env, PATH: `${repo}/bin:${process.env.PATH}`, FIXTURE_REPO: repo,
    FIXTURE_SIGNING_KEY: signing.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') };
  const run = (args, extra = {}) => spawnSync('bash', ['build.sh', ...args], { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
  const before = readFileSync(join(repo, '.livewall-key'));
  const locked = spawnSync('/usr/bin/python3', ['-c', `import fcntl,subprocess
with open('.livewall-build.lock','a') as file:
    fcntl.flock(file, fcntl.LOCK_EX)
    result=subprocess.run(['bash','build.sh','wallpapers'])
    assert result.returncode != 0
`], { cwd: repo, env, encoding: 'utf8' });
  assert.equal(locked.status, 0, locked.stderr);
  assert.ok(locked.stderr.includes('另一个 LiveWall'));
  const failed = run(['livewall'], { FIXTURE_BUILD_FAIL: '1' });
  assert.notEqual(failed.status, 0);
  assert.deepEqual(readFileSync(join(repo, '.livewall-key')), before);
  assert.equal(readFileSync(join(repo, 'studio/public/data/livewall/catalog.json'), 'utf8'), 'previous-catalog');
  assert.equal(readFileSync(join(repo, 'build/studio.meowv.com/data/livewall/catalog.json'), 'utf8'), 'previous-deploy');
  assert.equal(readFileSync(join(repo, 'livewall/build/LiveWall.app/old-marker'), 'utf8'), 'previous-app');
  for (const failure of [{ FIXTURE_SIGN_FAIL: '1' }, { FIXTURE_DMG_FAIL: '1' }]) {
    const result = run(['livewall', '--with-dmg'], failure);
    assert.notEqual(result.status, 0);
    assert.deepEqual(readFileSync(join(repo, '.livewall-key')), before);
    assert.equal(readFileSync(join(repo, 'studio/public/data/livewall/catalog.json'), 'utf8'), 'previous-catalog');
    assert.equal(readFileSync(join(repo, 'build/studio.meowv.com/data/livewall/catalog.json'), 'utf8'), 'previous-deploy');
    assert.equal(readFileSync(join(repo, 'livewall/build/LiveWall.app/old-marker'), 'utf8'), 'previous-app');
  }
  const built = run(['livewall']);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const next = readFileSync(join(repo, '.livewall-key'));
  assert.notDeepEqual(next, before);
  assert.ok(!existsSync(join(repo, 'studio/public/data/livewall.json')));
  assert.ok(!existsSync(join(repo, 'build/studio.meowv.com/data/livewall.json')));
  for (const app of ['livewall/build/LiveWall.app', 'build/livewall/LiveWall.app']) {
    assert.deepEqual(readFileSync(join(repo, app, 'Contents/Resources/livewall-catalog-key.txt')), next);
  }
  const source = join(repo, 'studio/public/data/livewall');
  const deploy = join(repo, 'build/studio.meowv.com/data/livewall');
  const publicSource = join(repo, 'livewall/Sources/LiveWallCore/UpdateSignature.swift');
  checkCatalog(source, join(repo, '.livewall-key'), [], publicSource);
  checkCatalog(deploy, join(repo, '.livewall-key'), [], publicSource);
  assert.ok(!existsSync(join(deploy, 'version.json')), '换钥后不保留旧密钥 App 的分发文件');
  for (const args of [['wallpapers'], ['studio', '--with-wallpapers']]) {
    const reused = run(args);
    assert.equal(reused.status, 0, reused.stdout + reused.stderr);
    assert.deepEqual(readFileSync(join(repo, '.livewall-key')), next);
    checkCatalog(source, join(repo, '.livewall-key'), [], publicSource);
    checkCatalog(deploy, join(repo, '.livewall-key'), [], publicSource);
  }
  for (const args of [['livewall', '--with-dmg'], ['all'], [], ['livewall', 'studio'], ['studio', 'livewall']]) {
    const previous = readFileSync(join(repo, '.livewall-key'));
    const result = run(args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.notDeepEqual(readFileSync(join(repo, '.livewall-key')), previous);
    checkCatalog(source, join(repo, '.livewall-key'), [], publicSource);
    checkCatalog(deploy, join(repo, '.livewall-key'), [], publicSource);
    if (args.includes('--with-dmg')) {
      assert.ok(existsSync(join(deploy, 'LiveWall-1.0.0.dmg')));
      assert.ok(existsSync(join(deploy, 'version.json.sig')));
    }
  }
  writeFileSync(join(repo, '.livewall-key'), Buffer.alloc(32, 0x42).toString('base64'));
  const catalogBefore = readFileSync(join(source, 'catalog.json'));
  assert.notEqual(run(['wallpapers']).status, 0);
  assert.deepEqual(readFileSync(join(source, 'catalog.json')), catalogBefore);
  rmSync(join(repo, '.livewall-key'));
  assert.notEqual(run(['wallpapers']).status, 0);
  assert.deepEqual(readFileSync(join(source, 'catalog.json')), catalogBefore);
});

test('直接发布入口统一转交根构建，开发 release 使用明确的开发标记', t => {
  const f = fixture(t);
  const repo = join(f.root, 'entrypoints');
  mkdirSync(join(repo, 'livewall'), { recursive: true });
  for (const name of ['build.sh', 'make-dmg.sh', 'run.sh']) {
    copyFileSync(new URL(`../${name}`, import.meta.url), join(repo, 'livewall', name));
    chmodSync(join(repo, 'livewall', name), 0o755);
  }
  const record = join(repo, 'args');
  writeFileSync(join(repo, 'build.sh'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$FIXTURE_RECORD"\n');
  chmodSync(join(repo, 'build.sh'), 0o755);
  const env = { ...process.env, FIXTURE_RECORD: record };
  delete env.LIVEWALL_RELEASE_BUILD_DIR;
  for (const [script, flags, expected] of [
    ['build.sh', [], 'livewall\n'], ['build.sh', ['--bump-build'], 'livewall\n'],
    ['make-dmg.sh', [], 'livewall\n--with-dmg\n'],
  ]) {
    const result = spawnSync('bash', [join(repo, 'livewall', script), ...flags], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(record, 'utf8'), expected);
  }
  assert.notEqual(spawnSync('bash', [join(repo, 'livewall/make-dmg.sh'), '--no-build'], { env }).status, 0);
  writeFileSync(join(repo, 'livewall/build.sh'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$FIXTURE_RECORD"\n');
  mkdirSync(join(repo, 'livewall/build/LiveWall.app/Contents/MacOS'), { recursive: true });
  const binary = join(repo, 'livewall/build/LiveWall.app/Contents/MacOS/LiveWall');
  writeFileSync(binary, '#!/bin/bash\nexit 0\n');
  chmodSync(binary, 0o755);
  const result = spawnSync('bash', [join(repo, 'livewall/run.sh'), '--release'], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(readFileSync(record, 'utf8').includes('--development'));
});

// 可选的 Swift 小程序由定向检查编译，只处理临时合成数据，不读取发布密钥。
test('Node → Swift 解密及 Swift → Node 缓存互通', { skip: !process.env.LIVEWALL_CRYPTO_PROBE }, t => {
  const f = fixture(t);
  const probe = process.env.LIVEWALL_CRYPTO_PROBE;
  const dir = f.catalog('interop');
  const index = encryptCatalogDirectory(dir, { keyFile: f.key });
  const input = join(dir, index.allSlice.file);
  const output = join(f.root, 'swift-cache.bin');
  const result = spawnSync(probe, [f.key, input, output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(output));
  // 同一个 probe 还会校验错上下文、错密钥、篡改、gzip 损坏和超限拒绝。
  const data = readFileSync(output);
  const derived = createHash('sha256').update(Buffer.alloc(32, 0x41)).update(data.subarray(0, 5)).update('index-cache').digest();
  return import('node:crypto').then(({ createDecipheriv }) => {
    const cipher = createDecipheriv('aes-256-gcm', derived, data.subarray(5, 17));
    cipher.setAuthTag(data.subarray(17, 33));
    assert.equal(gunzipSync(Buffer.concat([cipher.update(data.subarray(33)), cipher.final()])).toString(), 'swift-cache');
    for (const [name, compressed] of [
      ['oversize', gzipSync(Buffer.alloc(16 * 1024 * 1024 + 1))],
      ['bad-gzip', (() => { const bytes = gzipSync(Buffer.from('fixture')); bytes.fill(0, bytes.length - 8); return bytes; })()],
    ]) {
      const iv = Buffer.alloc(12, 2);
      const sliceKey = createHash('sha256').update(Buffer.alloc(32, 0x41)).update(Buffer.from('LWCB\x01')).update('all').digest();
      const enc = createCipheriv('aes-256-gcm', sliceKey, iv);
      const ct = Buffer.concat([enc.update(compressed), enc.final()]);
      const bad = join(f.root, `${name}.bin`);
      writeFileSync(bad, Buffer.concat([Buffer.from('LWCB\x01'), iv, enc.getAuthTag(), ct]));
      const rejected = spawnSync(probe, [f.key, bad, output, 'reject'], { encoding: 'utf8' });
      assert.equal(rejected.status, 0, rejected.stderr);
    }
  });
});
