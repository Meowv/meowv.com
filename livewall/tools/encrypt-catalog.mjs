import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const CATALOG_MAGIC = Buffer.from('LWCB', 'ascii');
export const CATALOG_ENCRYPTION_VERSION = 1;
export const CATALOG_ENCRYPTION_NAME = 'aes-256-gcm';
export const CATALOG_COMPRESSION = 'gzip';

const KEY_BYTES = 32;

function normalizeKey(value) {
  const key = Buffer.from(value ?? []);
  if (key.length !== KEY_BYTES) throw new Error('LiveWall 清单密钥长度无效。');
  return key;
}

function deriveKey(masterKey, context) {
  return createHash('sha256')
    .update(normalizeKey(masterKey))
    .update(CATALOG_MAGIC)
    .update(Buffer.from([CATALOG_ENCRYPTION_VERSION]))
    .update(String(context), 'utf8')
    .digest();
}

export function keyID(masterKey) {
  return createHash('sha256').update(normalizeKey(masterKey)).digest('hex').slice(0, 16);
}

export function readKeyFile(path) {
  if (!existsSync(path)) throw new Error(`找不到 LiveWall 清单密钥：${path}`);
  const text = readFileSync(path, 'utf8').trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(text)) throw new Error('LiveWall 清单密钥编码无效。');
  return normalizeKey(Buffer.from(text, 'base64'));
}

function writeKeyFile(path, key) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${normalizeKey(key).toString('base64')}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  chmodSync(path, 0o600);
}

function encryptPayload(payload, context, masterKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(masterKey, context), iv);
  const compressed = gzipSync(payload);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return Buffer.concat([
    CATALOG_MAGIC,
    Buffer.from([CATALOG_ENCRYPTION_VERSION]),
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

function encryptedName(name) {
  if (!name.endsWith('.json')) throw new Error(`清单切片文件名不是 JSON：${name}`);
  return `${name.slice(0, -5)}.bin`;
}

function rewriteEntry(entry, context, directory, masterKey) {
  if (!entry?.file) return;
  const jsonName = entry.file;
  const sourcePath = join(directory, jsonName);
  if (!existsSync(sourcePath)) throw new Error(`清单切片不存在：${sourcePath}`);
  if (basename(jsonName) !== jsonName || /[\\:%?#]/.test(jsonName)) throw new Error('切片文件名不合法。');
  const plain = readFileSync(sourcePath);
  if (plain.length > 16 * 1024 * 1024) throw new Error('清单切片超过解压大小限制。');
  const payload = encryptPayload(plain, context, masterKey);
  const binName = encryptedName(jsonName).replace('.bin', `.${createHash('sha256').update(payload).digest('hex').slice(0, 16)}.bin`);
  const targetPath = join(directory, binName);
  writeFileSync(targetPath, payload);
  unlinkSync(sourcePath);
  entry.file = binName;
  entry.fileSize = payload.length;
  entry.sha256 = createHash('sha256').update(payload).digest('hex');
}

export function encryptCatalogDirectory(directory, options = {}) {
  const manifestPath = join(directory, 'catalog.json');
  if (!existsSync(manifestPath)) throw new Error(`缺少 LiveWall 索引：${manifestPath}`);

  if (options.rotateKey && existsSync(options.keyFile)) throw new Error('轮换只能写入新的暂存密钥文件。');
  const masterKey = options.rotateKey
    ? randomBytes(KEY_BYTES)
    : readKeyFile(options.keyFile);
  if (options.keyFile && (options.rotateKey || !existsSync(options.keyFile))) {
    writeKeyFile(options.keyFile, masterKey);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.categories)) throw new Error('LiveWall 索引缺少 categories。');

  for (const entry of manifest.categories) {
    rewriteEntry(entry, `category:${entry.id}`, directory, masterKey);
  }
  if (manifest.allSlice) rewriteEntry(manifest.allSlice, 'all', directory, masterKey);

  if (existsSync(join(directory, 'catalog.json.sig'))) unlinkSync(join(directory, 'catalog.json.sig'));
  manifest.schemaVersion = 2;
  manifest.encryption = CATALOG_ENCRYPTION_NAME;
  manifest.encryptionVersion = CATALOG_ENCRYPTION_VERSION;
  manifest.compression = CATALOG_COMPRESSION;
  manifest.keyID = keyID(masterKey);
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');

  const keepBins = new Set(['catalog.json']);
  for (const entry of manifest.categories) if (entry.file) keepBins.add(entry.file);
  if (manifest.allSlice?.file) keepBins.add(manifest.allSlice.file);
  for (const name of readdirSync(directory)) {
    if (
      (name.startsWith('category.') || name.startsWith('all.')) &&
      (name.endsWith('.json') || name.endsWith('.bin')) &&
      !keepBins.has(name)
    ) {
      unlinkSync(join(directory, name));
    }
  }
  return manifest;
}

function usage() {
  console.error(
    '用法：node encrypt-catalog.mjs <livewall-dir> --key-file <path> [--rotate-key]',
  );
}

if (process.argv[1] && basename(process.argv[1]) === basename(import.meta.url)) {
  const directory = process.argv[2];
  const keyFlag = process.argv.indexOf('--key-file');
  const keyFile = keyFlag >= 0 ? process.argv[keyFlag + 1] : undefined;
  const rotateKey = process.argv.includes('--rotate-key');
  if (!directory || !keyFile) {
    usage();
    process.exit(2);
  }
  encryptCatalogDirectory(directory, { keyFile, rotateKey });
  console.log(`[livewall] 已加密清单：${directory}`);
}
