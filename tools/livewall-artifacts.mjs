import { createDecipheriv, createHash, createPublicKey, verify } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyID, readKeyFile } from '../livewall/tools/encrypt-catalog.mjs';

const sha256 = data => createHash('sha256').update(data).digest('hex');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function checkAppKey(keyFile, apps) {
  const key = readKeyFile(keyFile);
  const id = keyID(key);
  if (!apps.length) throw new Error('没有当前 App 产物，无法沿用密钥；请先正式构建 LiveWall。');
  for (const app of apps) {
    const resource = resolve(app, 'Contents/Resources/livewall-catalog-key.txt');
    if (!readKeyFile(resource).equals(key)) throw new Error('LiveWall 密钥与 App 产物不匹配。');
  }
  return id;
}

export function checkCatalog(directory, keyFile, apps = [], publicKeySource = resolve(repo, 'livewall/Sources/LiveWallCore/UpdateSignature.swift')) {
  const key = readKeyFile(keyFile);
  if (apps.length) checkAppKey(keyFile, apps);
  const payload = readFileSync(resolve(directory, 'catalog.json'));
  const index = JSON.parse(payload);
  if (index.schemaVersion !== 2 || index.keyID !== keyID(key) ||
      index.encryption !== 'aes-256-gcm' || index.encryptionVersion !== 1 || index.compression !== 'gzip' ||
      !index.categories?.length) throw new Error('索引格式或密钥标识不匹配。');
  const signature = JSON.parse(readFileSync(resolve(directory, 'catalog.json.sig')));
  const source = readFileSync(publicKeySource, 'utf8');
  const publicBytes = Buffer.from(source.match(/publicKeyBase64\s*=\s*"([^"]+)"/)[1], 'base64');
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), publicBytes]),
    format: 'der', type: 'spki',
  });
  if (signature.alg !== 'ed25519' ||
      !verify(null, payload, publicKey, Buffer.from(signature.signature, 'base64'))) {
    throw new Error('索引签名不匹配。');
  }
  const allowed = new Set(['catalog.json', 'catalog.json.sig']);
  const entries = index.categories.map(entry => [entry, `category:${entry.id}`]);
  if (index.allSlice) entries.push([index.allSlice, 'all']);
  for (const [entry, context] of entries) {
    if (!entry.file) {
      if (entry.itemCount !== 0 || entry.sha256) throw new Error('空分类声明不一致。');
      continue;
    }
    if (!/^[A-Za-z0-9._-]+\.bin$/.test(entry.file) || entry.itemCount <= 0) throw new Error('切片文件名或数量无效。');
    allowed.add(entry.file);
    const data = readFileSync(resolve(directory, entry.file));
    if (sha256(data) !== entry.sha256 || data.length <= 33 || data.subarray(0, 5).toString('hex') !== '4c57434201') {
      throw new Error('密文格式或摘要不匹配。');
    }
    const derived = createHash('sha256').update(key).update(data.subarray(0, 5)).update(context).digest();
    const cipher = createDecipheriv('aes-256-gcm', derived, data.subarray(5, 17));
    cipher.setAuthTag(data.subarray(17, 33));
    const plain = gunzipSync(Buffer.concat([cipher.update(data.subarray(33)), cipher.final()]), { maxOutputLength: 16 * 1024 * 1024 });
    const slice = JSON.parse(plain);
    if (slice.items?.length !== entry.itemCount || slice.generatedAt !== index.generatedAt ||
        (context !== 'all' && !slice.source.categoryIds.includes(entry.id))) throw new Error('切片内容与索引不一致。');
  }
  if (readdirSync(directory).some(name => !allowed.has(name) &&
      !['version.json', 'version.json.sig'].includes(name) && !/^LiveWall-[\d.]+\.dmg$/.test(name))) {
    throw new Error('清单目录混入了额外文件。');
  }
}

// 所有产物核对完成后统一晋升；任一重命名失败时按逆序恢复旧产物与旧密钥。
export function promote(pairs, move = renameSync) {
  const changes = [];
  try {
    for (const [source, target] of pairs) {
      if (source && (!existsSync(source) || lstatSync(source).isSymbolicLink())) throw new Error('晋升源缺失或为符号链接。');
      let parent = resolve(target);
      while (true) {
        if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error('晋升目标路径包含符号链接。');
        if (dirname(parent) === parent) break;
        parent = dirname(parent);
      }
    }
    for (const [source, target] of pairs) {
      if ((source && !existsSync(source)) || (existsSync(target) && lstatSync(target).isSymbolicLink())) {
        throw new Error('晋升源缺失或目标为符号链接。');
      }
      mkdirSync(dirname(target), { recursive: true });
      const backup = `${target}.livewall-backup.${process.pid}`;
      if (existsSync(backup)) throw new Error('晋升备份路径已存在。');
      const change = { target, backup, previous: existsSync(target), installed: false };
      if (change.previous) move(target, backup);
      changes.push(change);
      if (source) {
        move(source, target);
        change.installed = true;
      }
    }
  } catch (error) {
    for (const change of changes.reverse()) {
      if (change.installed) rmSync(change.target, { recursive: true, force: true });
      if (change.previous) renameSync(change.backup, change.target);
    }
    throw error;
  }
  for (const change of changes) {
    if (change.previous) {
      try { rmSync(change.backup, { recursive: true, force: true }); }
      catch { console.error('[livewall] 新产物已晋升，旧产物备份未能清理。'); }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'check-key') checkAppKey(args[0], args.slice(1));
    else if (command === 'check') checkCatalog(args[0], args[1], args.slice(2));
    else if (command === 'promote' && args.length > 0 && args.length % 2 === 0) {
      promote(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2] === '-' ? null : args[i * 2], args[i * 2 + 1]]));
    } else throw new Error('未知操作或参数缺失。');
  } catch (error) {
    console.error(`[livewall] ${error.message}`);
    process.exit(1);
  }
}
