import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
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

export const CATALOG_ENCRYPTION_VERSION = 2;
export const CATALOG_ENCRYPTION_NAME = 'aes-256-gcm';
export const CATALOG_COMPRESSION = 'gzip';
export const CATALOG_MAGIC = Buffer.from('MWPC', 'ascii');
const MASTER_KEY_BYTES = 32;
const CATALOG_JSON_PATTERN =
  /^wallpapers\.catalog\.(?:desktop\.(?:dynamic|static)|mobile\.(?:dynamic|static)|bootstrap)\.\d{8}-\d{6}\.json$/;
const CATALOG_BIN_PATTERN =
  /^wallpapers\.catalog(?:\.(?:desktop\.(?:dynamic|static)|mobile\.(?:dynamic|static)|bootstrap))?\.\d{8}-\d{6}\.bin$/;

function normalizeMasterKey(masterKey) {
  const value = Buffer.from(masterKey ?? []);
  if (value.length !== MASTER_KEY_BYTES) throw new Error('壁纸目录发布密钥长度无效。');
  return value;
}

function encryptionKey(masterKey, context) {
  return createHash('sha256')
    .update(normalizeMasterKey(masterKey))
    .update(CATALOG_MAGIC)
    .update(Buffer.from([CATALOG_ENCRYPTION_VERSION]))
    .update(String(context), 'utf8')
    .digest();
}

function writeKeyFile(keyFile, masterKey) {
  mkdirSync(dirname(keyFile), { recursive: true });
  writeFileSync(keyFile, `${masterKey.toString('base64')}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(keyFile, 0o600);
}

function readKeyFile(keyFile) {
  return normalizeMasterKey(Buffer.from(readFileSync(keyFile, 'utf8').trim(), 'base64'));
}

export function encryptPayload(payload, context, masterKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(masterKey, context), iv);
  const compressed = gzipSync(payload);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    CATALOG_MAGIC,
    Buffer.from([CATALOG_ENCRYPTION_VERSION]),
    iv,
    tag,
    ciphertext,
  ]);
}

export function decryptPayload(payload, context, masterKey) {
  if (payload.subarray(0, CATALOG_MAGIC.length).compare(CATALOG_MAGIC) !== 0) {
    throw new Error('壁纸目录加密文件格式无效。');
  }
  if (payload[CATALOG_MAGIC.length] !== CATALOG_ENCRYPTION_VERSION) {
    throw new Error('壁纸目录加密版本不匹配。');
  }
  const ivStart = CATALOG_MAGIC.length + 1;
  const tagStart = ivStart + 12;
  const ciphertextStart = tagStart + 16;
  if (payload.length <= ciphertextStart) throw new Error('壁纸目录加密文件格式无效。');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(masterKey, context),
    payload.subarray(ivStart, tagStart),
  );
  decipher.setAuthTag(payload.subarray(tagStart, ciphertextStart));
  return gunzipSync(
    Buffer.concat([decipher.update(payload.subarray(ciphertextStart)), decipher.final()]),
  );
}

export function encryptCatalogDirectory(directory, options = {}) {
  const manifestPath = join(directory, 'wallpapers.catalog.json');
  if (!existsSync(manifestPath)) throw new Error(`缺少壁纸目录 manifest：${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const contextByFile = new Map(
    Object.entries(manifest.catalogs ?? {}).map(([bucket, entry]) => [entry.file, bucket]),
  );
  if (manifest.bootstrap) contextByFile.set(manifest.bootstrap, 'bootstrap');

  const masterKey = options.masterKey
    ? normalizeMasterKey(options.masterKey)
    : options.reuseKey && options.keyFile && existsSync(options.keyFile)
      ? readKeyFile(options.keyFile)
      : randomBytes(MASTER_KEY_BYTES);
  if (options.keyFile && (!options.reuseKey || !existsSync(options.keyFile))) {
    writeKeyFile(options.keyFile, masterKey);
  }

  const names = readdirSync(directory).filter((name) => CATALOG_JSON_PATTERN.test(name));
  if (names.length !== 5) {
    throw new Error(`壁纸目录 JSON 数量应为 5，实际为 ${names.length}：${directory}`);
  }

  const encryptedNames = new Map();
  for (const name of names) {
    const context = contextByFile.get(name);
    if (!context) throw new Error(`manifest 未登记壁纸目录文件：${name}`);
    const encryptedName = `${name.slice(0, -5)}.bin`;
    writeFileSync(
      join(directory, encryptedName),
      encryptPayload(readFileSync(join(directory, name)), context, masterKey),
    );
    unlinkSync(join(directory, name));
    encryptedNames.set(name, encryptedName);
  }

  for (const name of readdirSync(directory)) {
    if (CATALOG_BIN_PATTERN.test(name) && !encryptedNames.has(name.replace(/\.bin$/, '.json'))) {
      unlinkSync(join(directory, name));
    }
  }

  const catalogs = Object.fromEntries(
    Object.entries(manifest.catalogs ?? {}).map(([bucket, entry]) => {
      const file = encryptedNames.get(entry.file) ?? entry.file;
      return [bucket, { ...entry, file, fileSize: readFileSync(join(directory, file)).length }];
    }),
  );
  if (Object.keys(catalogs).length !== 4) {
    throw new Error('壁纸目录 manifest 缺少四个 catalog bucket。');
  }
  manifest.schemaVersion = 2;
  manifest.catalogs = catalogs;
  delete manifest.catalog;
  delete manifest.catalogFileSize;
  manifest.bootstrap = encryptedNames.get(manifest.bootstrap) ?? manifest.bootstrap;
  manifest.encryption = CATALOG_ENCRYPTION_NAME;
  manifest.encryptionVersion = CATALOG_ENCRYPTION_VERSION;
  manifest.compression = CATALOG_COMPRESSION;
  if (manifest.bootstrap)
    manifest.bootstrapFileSize = readFileSync(join(directory, manifest.bootstrap)).length;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

if (process.argv[1] && basename(process.argv[1]) === basename(import.meta.url)) {
  const directory = process.argv[2];
  const keyFlag = process.argv.indexOf('--key-file');
  const keyFile = keyFlag >= 0 ? process.argv[keyFlag + 1] : undefined;
  const reuseKey = process.argv.includes('--reuse-key');
  if (!directory || !keyFile) {
    console.error('用法：node encrypt-wallpaper.mjs <目录> --key-file <密钥文件>');
    process.exit(1);
  }
  encryptCatalogDirectory(directory, { keyFile, reuseKey });
  console.log(`[wallpapers] 已加密目录：${directory}`);
}
