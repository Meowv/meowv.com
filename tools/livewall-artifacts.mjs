import { createDecipheriv, createHash, createPublicKey, verify } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, rmSync, mkdirSync, writeFileSync, linkSync } from 'node:fs';
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

function restoreChanges(changes) {
  const errors = [];
  for (const change of [...changes].reverse()) {
    try {
      if (change.previous && existsSync(change.backup)) {
        rmSync(change.target, { recursive: true, force: true });
        renameSync(change.backup, change.target);
      } else if (!change.previous && change.source && !existsSync(change.source)) {
        rmSync(change.target, { recursive: true, force: true });
      }
    } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, '旧产物恢复未完成，保留事务记录与备份以便重试。');
}

function cleanBackups(changes) {
  for (const change of changes) {
    if (change.previous) rmSync(change.backup, { recursive: true, force: true });
  }
}

function writeJournal(path, record, initial = false) {
  const temporary = `${path}.tmp.${process.pid}`;
  try {
    writeFileSync(temporary, JSON.stringify(record), { mode: 0o600, flag: 'wx' });
    if (initial) linkSync(temporary, path);
    else renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

// 事务记录只含路径；恢复可重复执行，已经恢复的目标不会再次删除。
export function recoverPromotion(journalPath) {
  if (!existsSync(journalPath)) return false;
  if (lstatSync(journalPath).isSymbolicLink()) throw new Error('晋升事务记录不能是符号链接。');
  const record = JSON.parse(readFileSync(journalPath, 'utf8'));
  if (record.version !== 1 || !['pending', 'committed'].includes(record.state) ||
      !Array.isArray(record.changes) || record.changes.some(change =>
        typeof change.target !== 'string' || typeof change.previous !== 'boolean' ||
        !(change.source === null || typeof change.source === 'string') ||
        typeof change.backup !== 'string' || !change.backup.startsWith(`${change.target}.livewall-backup.`))) {
    throw new Error('晋升事务记录无效，已停止自动恢复。');
  }
  if (record.state === 'pending') restoreChanges(record.changes);
  else cleanBackups(record.changes);
  rmSync(journalPath);
  return true;
}

// 在每次移动后处理信号；回滚完成前保留信号处理器和外层构建锁。
export async function promote(pairs, move = renameSync, journalPath = null) {
  let changes = [];
  let started = false;
  let interrupted = null;
  const onInterrupt = signal => { interrupted ??= signal; };
  const onInt = () => onInterrupt('SIGINT');
  const onTerm = () => onInterrupt('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  const checkpoint = async () => {
    await new Promise(resolve => setImmediate(resolve));
    if (interrupted) throw Object.assign(new Error(`晋升收到 ${interrupted}，已取消。`), {
      exitCode: interrupted === 'SIGINT' ? 130 : 143,
    });
  };
  try {
    if (journalPath && existsSync(journalPath)) throw new Error('存在未完成的晋升事务，请先恢复。');
    const prepared = [];
    for (const [source, target] of pairs) {
      if (source && (!existsSync(source) || lstatSync(source).isSymbolicLink())) throw new Error('晋升源缺失或为符号链接。');
      let parent = resolve(target);
      while (true) {
        if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error('晋升目标路径包含符号链接。');
        if (dirname(parent) === parent) break;
        parent = dirname(parent);
      }
      const backup = `${target}.livewall-backup.${process.pid}`;
      if (existsSync(backup)) throw new Error('晋升备份路径已存在。');
      prepared.push({ source, target, backup, previous: existsSync(target) });
    }
    changes = prepared;
    if (journalPath) writeJournal(journalPath, { version: 1, state: 'pending', changes }, true);
    started = true;
    await checkpoint();
    for (const { source, target, backup, previous } of changes) {
      if ((source && !existsSync(source)) || (existsSync(target) && lstatSync(target).isSymbolicLink())) {
        throw new Error('晋升源缺失或目标为符号链接。');
      }
      mkdirSync(dirname(target), { recursive: true });
      if (previous) {
        move(target, backup);
        await checkpoint();
      }
      if (source) {
        move(source, target);
        await checkpoint();
      }
    }
    await checkpoint();
    if (journalPath) writeJournal(journalPath, { version: 1, state: 'committed', changes });
  } catch (error) {
    if (started) {
      restoreChanges(changes);
      if (journalPath) rmSync(journalPath);
    }
    throw error;
  } finally {
    process.removeListener('SIGINT', onInt);
    process.removeListener('SIGTERM', onTerm);
  }
  try {
    cleanBackups(changes);
    if (journalPath) rmSync(journalPath);
  } catch {
    console.error('[livewall] 新产物已晋升，旧产物备份未能清理；下次构建会重试清理。');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'check-key') checkAppKey(args[0], args.slice(1));
    else if (command === 'check') checkCatalog(args[0], args[1], args.slice(2));
    else if (command === 'recover' && args.length === 1) recoverPromotion(args[0]);
    else if (command === 'promote' && args[0] === '--journal' && args.length > 2 && args.length % 2 === 0) {
      await promote(Array.from({ length: (args.length - 2) / 2 }, (_, i) =>
        [args[i * 2 + 2] === '-' ? null : args[i * 2 + 2], args[i * 2 + 3]]), renameSync, args[1]);
    } else if (command === 'promote' && args.length > 0 && args.length % 2 === 0) {
      await promote(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2] === '-' ? null : args[i * 2], args[i * 2 + 1]]));
    } else throw new Error('未知操作或参数缺失。');
  } catch (error) {
    console.error(`[livewall] ${error.message}`);
    process.exitCode = error.exitCode ?? 1;
  }
}
