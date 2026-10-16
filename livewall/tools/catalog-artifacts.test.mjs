import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCipheriv, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, renameSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { encryptCatalogDirectory, keyID } from './encrypt-catalog.mjs';
import { checkCatalog, checkAppKey, promote, recoverPromotion } from '../../tools/livewall-artifacts.mjs';

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

test('晋升失败恢复全部旧产物及旧密钥，成功才替换', async t => {
  const f = fixture(t);
  const pairs = ['App', 'catalog', 'key'].map(name => {
    const source = join(f.root, `new-${name}`), target = join(f.root, `old-${name}`);
    writeFileSync(source, `new-${name}`);
    writeFileSync(target, `old-${name}`);
    return [source, target];
  });
  let moves = 0;
  await assert.rejects(() => promote(pairs, (from, to) => {
    if (++moves === 6) throw new Error('fixture: key promotion failed');
    renameSync(from, to);
  }));
  for (const [, target] of pairs) assert.equal(readFileSync(target, 'utf8'), target.split('/').at(-1));
  for (const [source] of pairs) writeFileSync(source, 'promoted');
  await promote(pairs);
  for (const [, target] of pairs) assert.equal(readFileSync(target, 'utf8'), 'promoted');
  assert.ok(!readdirSync(f.root).some(name => name.includes('.livewall-backup.')));
});

test('SIGINT / SIGTERM 在每次重命名后均回滚，强制终止后可恢复', t => {
  const f = fixture(t);
  const moduleURL = new URL('../../tools/livewall-artifacts.mjs', import.meta.url).href;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL']) {
    for (let stop = 1; stop <= 6; stop++) {
      const dir = join(f.root, `${signal}-${stop}`);
      mkdirSync(dir);
      const journal = join(dir, 'transaction.json');
      const pairs = ['App', 'catalog', 'key'].map(name => {
        const source = join(dir, `new-${name}`), target = join(dir, `current-${name}`);
        writeFileSync(source, `new-${name}`);
        writeFileSync(target, `old-${name}`);
        return [source, target];
      });
      const worker = `import {promote} from ${JSON.stringify(moduleURL)};
import {renameSync} from 'node:fs';
let moves=0;
try { await promote(${JSON.stringify(pairs)}, (from,to)=>{
  renameSync(from,to);
  if(++moves===${stop}) process.kill(process.pid,${JSON.stringify(signal)});
},${JSON.stringify(journal)}); }
catch(error) { process.exitCode=error.exitCode ?? 1; }`;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', worker]);
      if (signal === 'SIGKILL') {
        assert.equal(result.signal, signal);
        assert.ok(existsSync(journal));
        assert.equal(recoverPromotion(journal), true);
      } else {
        assert.equal(result.status, signal === 'SIGINT' ? 130 : 143, result.stderr.toString());
      }
      for (const [ , target] of pairs) assert.equal(readFileSync(target, 'utf8'), `old-${target.split('-').at(-1)}`);
      assert.equal(recoverPromotion(journal), false);
      assert.ok(!readdirSync(dir).some(name => name.includes('.livewall-backup.')));
    }
  }
});

test('事务恢复覆盖新增目标、删除目标及提交后清理，并可重复执行', t => {
  const f = fixture(t);
  const target = join(f.root, 'target'), backup = `${target}.livewall-backup.fixture`;
  const source = join(f.root, 'missing-source'), journal = join(f.root, 'transaction.json');
  const record = (state, previous) => writeFileSync(journal, JSON.stringify({ version: 1, state,
    changes: [{ source, target, backup, previous }] }));
  writeFileSync(target, 'new');
  record('pending', false);
  recoverPromotion(journal);
  assert.ok(!existsSync(target));
  writeFileSync(backup, 'old');
  record('pending', true);
  recoverPromotion(journal);
  assert.equal(readFileSync(target, 'utf8'), 'old');
  // 模拟目标已恢复、事务记录尚未删除时再次退出。
  record('pending', true);
  recoverPromotion(journal);
  assert.equal(readFileSync(target, 'utf8'), 'old');
  writeFileSync(target, 'new');
  writeFileSync(backup, 'old');
  record('committed', true);
  recoverPromotion(journal);
  assert.equal(readFileSync(target, 'utf8'), 'new');
  assert.ok(!existsSync(backup));
});

test('构建锁转发中断并等到子进程完成回滚才释放', async t => {
  const f = fixture(t);
  const worker = join(f.root, 'worker.mjs');
  const moduleURL = new URL('../../tools/livewall-artifacts.mjs', import.meta.url).href;
  const locker = new URL('../../tools/with-livewall-build-lock.py', import.meta.url).pathname;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL']) {
    const marker = join(f.root, `${signal}-ready`), target = join(f.root, `${signal}-target`);
    const source = join(f.root, `${signal}-source`);
    writeFileSync(target, 'old'); writeFileSync(source, 'new');
    writeFileSync(worker, `import {promote} from ${JSON.stringify(moduleURL)};
import {renameSync,writeFileSync} from 'node:fs';
let moves=0;
try { await promote([[${JSON.stringify(source)},${JSON.stringify(target)}]],(from,to)=>{
  renameSync(from,to);
  if(++moves===2) {writeFileSync(${JSON.stringify(marker)},String(process.pid)); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);}
}); } catch(error) { process.exitCode=error.exitCode ?? 1; }`);
    const child = spawn('/usr/bin/python3', [locker, f.root, process.execPath, worker], { stdio: 'ignore' });
    const finished = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    for (let i = 0; i < 200 && !existsSync(marker); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(existsSync(marker), '子进程应进入晋升');
    child.kill(signal);
    const competing = spawnSync('/usr/bin/python3', [locker, f.root, '/usr/bin/true']);
    assert.notEqual(competing.status, 0, '回滚完成前锁必须仍由父进程持有');
    if (signal === 'SIGKILL') {
      assert.deepEqual(await finished, { code: null, signal });
      // 包装进程被强制终止后，子进程继承的描述符继续持锁。
      process.kill(Number(readFileSync(marker, 'utf8')), 'SIGTERM');
      for (let i = 0; i < 100 && readFileSync(target, 'utf8') !== 'old'; i++) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } else {
      assert.deepEqual(await finished, { code: signal === 'SIGINT' ? 130 : 143, signal: null });
    }
    assert.equal(readFileSync(target, 'utf8'), 'old');
    assert.equal(spawnSync('/usr/bin/python3', [locker, f.root, '/usr/bin/true']).status, 0);
  }
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
  put('bin/node', `#!/bin/bash
if [[ "\${1:-}" == */tools/livewall-artifacts.mjs && "\${2:-}" == promote && -n "\${FIXTURE_PROMOTION_SIGNAL:-}" ]]; then
  exec "$FIXTURE_NODE" "$FIXTURE_REPO/fixture-promote.mjs" "$@"
fi
exec "$FIXTURE_NODE" "$@"
`, true);
  put('fixture-promote.mjs', `import {promote} from './tools/livewall-artifacts.mjs';
import {renameSync} from 'node:fs';
const [tool,command,flag,journal,...args]=process.argv.slice(2);
let moves=0;
try { await promote(Array.from({length:args.length/2},(_,i)=>[args[i*2]==='-'?null:args[i*2],args[i*2+1]]),(from,to)=>{
  renameSync(from,to);
  if(++moves===2) process.kill(0,process.env.FIXTURE_PROMOTION_SIGNAL);
},journal); } catch(error) {process.exitCode=error.exitCode ?? 1;}`);
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
  const env = { ...process.env, PATH: `${repo}/bin:${process.env.PATH}`, FIXTURE_REPO: repo, FIXTURE_NODE: process.execPath,
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
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const sourceBefore = readFileSync(join(source, 'catalog.json'));
    const deployBefore = readFileSync(join(deploy, 'catalog.json'));
    const interrupted = run(['livewall'], { FIXTURE_PROMOTION_SIGNAL: signal });
    assert.equal(interrupted.status, signal === 'SIGINT' ? 130 : 143, interrupted.stdout + interrupted.stderr);
    assert.deepEqual(readFileSync(join(repo, '.livewall-key')), next);
    assert.deepEqual(readFileSync(join(source, 'catalog.json')), sourceBefore);
    assert.deepEqual(readFileSync(join(deploy, 'catalog.json')), deployBefore);
    for (const app of ['livewall/build/LiveWall.app', 'build/livewall/LiveWall.app']) {
      assert.deepEqual(readFileSync(join(repo, app, 'Contents/Resources/livewall-catalog-key.txt')), next);
    }
    assert.ok(!existsSync(join(repo, '.livewall-promotion.json')));
    assert.ok(!readdirSync(join(repo, 'build')).some(name => name.includes('.livewall-backup.')));
  }
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
  // 上一次被强制终止在换钥中途；根入口必须在读取当前密钥前先恢复。
  const currentKey = join(repo, '.livewall-key');
  const expectedKey = readFileSync(currentKey);
  const backupKey = `${currentKey}.livewall-backup.fixture`;
  renameSync(currentKey, backupKey);
  writeFileSync(currentKey, Buffer.alloc(32, 0x42).toString('base64'));
  writeFileSync(join(repo, '.livewall-promotion.json'), JSON.stringify({ version: 1, state: 'pending',
    changes: [{ source: join(repo, 'interrupted-key'), target: currentKey, backup: backupKey, previous: true }] }));
  const recovered = run(['wallpapers']);
  assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
  assert.deepEqual(readFileSync(currentKey), expectedKey);
  assert.ok(!existsSync(join(repo, '.livewall-promotion.json')));
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

test('独立 Studio 构建不需要 LiveWall 密钥，携带清单时仍严格校验', t => {
  const f = fixture(t);
  const repo = join(f.root, 'studio-only');
  function put(path, content, executable = false) {
    const file = join(repo, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
    if (executable) chmodSync(file, 0o755);
  }
  for (const path of ['build.sh', 'tools/wallpapers-python.sh', 'tools/with-livewall-build-lock.py', 'tools/livewall-artifacts.mjs', 'livewall/tools/encrypt-catalog.mjs']) {
    put(path, readFileSync(new URL(`../../${path}`, import.meta.url)), true);
  }
  put('studio/public/data/unrelated.json', '{}');
  put('studio/node_modules/.bin/vue-tsc', '#!/bin/bash\nexit 0\n', true);
  put('studio/node_modules/.bin/vite', '#!/bin/bash\nset -e\nmkdir -p dist\necho fixture > dist/index.html\ncp -R public/data dist/\n', true);
  const run = () => spawnSync('bash', ['build.sh', 'studio'], { cwd: repo, encoding: 'utf8' });
  let result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(existsSync(join(repo, 'build/studio.meowv.com/index.html')));
  assert.ok(!existsSync(join(repo, '.livewall-key')));
  put('studio/public/data/livewall.json', '{}');
  assert.notEqual(run().status, 0, '旧明文不能随网站构建发布');
  rmSync(join(repo, 'studio/public/data/livewall.json'));
  const directory = f.catalog('valid-studio-catalog');
  encryptCatalogDirectory(directory, { keyFile: f.key }); f.signIndex(directory);
  mkdirSync(join(repo, 'studio/public/data/livewall'));
  for (const name of readdirSync(directory)) copyFileSync(join(directory, name), join(repo, 'studio/public/data/livewall', name));
  assert.notEqual(run().status, 0, '已有内容目录缺钥时仍失败');
  put('.livewall-key', readFileSync(f.key));
  put('livewall/Sources/LiveWallCore/UpdateSignature.swift', readFileSync(f.publicSource));
  result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  put('studio/public/data/livewall/all.json', '{}');
  assert.notEqual(run().status, 0, '已有目录混入明文时仍失败');
});

test('发布 build 参考两处 App 及更新清单，无 DMG 连续发布仍递增', t => {
  const f = fixture(t);
  const plist = join(f.root, 'staged.plist'), app = join(f.root, 'LiveWall.app');
  mkdirSync(join(app, 'Contents'), { recursive: true });
  const contents = build => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>LiveWall</string>
    <key>CFBundleVersion</key><string>${build}</string></dict></plist>`;
  const appPlist = join(app, 'Contents/Info.plist');
  const helper = new URL('./prepare-build-version.py', import.meta.url).pathname;
  const value = () => readFileSync(plist, 'utf8').match(/CFBundleVersion<\/key><string>(\d+)/)[1];
  const run = (...extra) => {
    const result = spawnSync('/usr/bin/python3', [helper, '--plist', plist, '--previous-app', app, ...extra], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  writeFileSync(appPlist, contents(41));
  for (const expected of [42, 43]) {
    writeFileSync(plist, readFileSync(appPlist)); run();
    assert.equal(value(), String(expected)); copyFileSync(plist, appPlist);
  }
  const feed = join(f.root, 'version.json');
  writeFileSync(feed, '{"build":60}');
  run('--previous-feed', feed); assert.equal(value(), '61');
  writeFileSync(plist, contents(100));
  run('--previous-feed', feed); assert.equal(value(), '100', '保留用户手动提高的 build');

  // 执行真实组装入口，到编译替身返回失败为止；不编译 App、不修改源 plist。
  const repo = join(f.root, 'version-entrypoint');
  mkdirSync(join(repo, 'livewall/Resources'), { recursive: true });
  mkdirSync(join(repo, 'livewall/tools')); mkdirSync(join(repo, 'bin'));
  copyFileSync(new URL('../build.sh', import.meta.url), join(repo, 'livewall/build.sh'));
  copyFileSync(helper, join(repo, 'livewall/tools/prepare-build-version.py'));
  const sourcePlist = join(repo, 'livewall/Resources/Info-LiveWall.plist');
  writeFileSync(sourcePlist, contents(41));
  mkdirSync(join(repo, 'build/livewall/LiveWall.app/Contents'), { recursive: true });
  writeFileSync(join(repo, 'build/livewall/LiveWall.app/Contents/Info.plist'), contents(41));
  const swift = join(repo, 'bin/swift');
  writeFileSync(swift, '#!/bin/bash\nexit 7\n'); chmodSync(swift, 0o755);
  const stage = join(repo, 'staged');
  const env = { ...process.env, PATH: `${repo}/bin:${process.env.PATH}`,
    LIVEWALL_RELEASE_BUILD_DIR: stage, LIVEWALL_CATALOG_KEY_FILE: f.key };
  const failed = spawnSync('bash', [join(repo, 'livewall/build.sh'), '--bump-build'], { env, encoding: 'utf8' });
  assert.equal(failed.status, 7, failed.stdout + failed.stderr);
  assert.equal(readFileSync(sourcePlist, 'utf8'), contents(41));
  assert.equal(readFileSync(join(stage, 'Info-LiveWall.plist'), 'utf8'), contents(42));
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
