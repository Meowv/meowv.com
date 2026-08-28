import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const CATALOG_ENCRYPTION_VERSION = 1;
export const CATALOG_ENCRYPTION_NAME = 'aes-256-gcm';
export const CATALOG_MAGIC = Buffer.from('MWPC', 'ascii');
const CATALOG_JSON_PATTERN =
  /^wallpapers\.catalog\.(?:desktop\.(?:dynamic|static)|mobile\.(?:dynamic|static)|bootstrap)\.\d{8}-\d{6}\.json$/;
const CATALOG_BIN_PATTERN =
  /^wallpapers\.catalog(?:\.(?:desktop\.(?:dynamic|static)|mobile\.(?:dynamic|static)|bootstrap))?\.\d{8}-\d{6}\.bin$/;

function encryptionKey() {
  return createHash('sha256')
    .update(Buffer.concat([CATALOG_MAGIC, Buffer.from([CATALOG_ENCRYPTION_VERSION])]))
    .digest();
}

export function encryptPayload(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    CATALOG_MAGIC,
    Buffer.from([CATALOG_ENCRYPTION_VERSION]),
    iv,
    tag,
    ciphertext,
  ]);
}

export function decryptPayload(payload) {
  if (payload.subarray(0, CATALOG_MAGIC.length).compare(CATALOG_MAGIC) !== 0) {
    throw new Error('壁纸目录加密文件格式无效。');
  }
  if (payload[CATALOG_MAGIC.length] !== CATALOG_ENCRYPTION_VERSION) {
    throw new Error('壁纸目录加密版本不匹配。');
  }
  const ivStart = CATALOG_MAGIC.length + 1;
  const tagStart = ivStart + 12;
  const ciphertextStart = tagStart + 16;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    payload.subarray(ivStart, tagStart),
  );
  decipher.setAuthTag(payload.subarray(tagStart, ciphertextStart));
  return Buffer.concat([decipher.update(payload.subarray(ciphertextStart)), decipher.final()]);
}

export function encryptCatalogDirectory(directory) {
  const names = readdirSync(directory).filter((name) => CATALOG_JSON_PATTERN.test(name));
  if (names.length !== 5) {
    throw new Error(`壁纸目录 JSON 数量应为 5，实际为 ${names.length}：${directory}`);
  }

  const encryptedNames = new Map();
  for (const name of names) {
    const encryptedName = `${name.slice(0, -5)}.bin`;
    const inputPath = join(directory, name);
    const outputPath = join(directory, encryptedName);
    writeFileSync(outputPath, encryptPayload(readFileSync(inputPath)));
    unlinkSync(inputPath);
    encryptedNames.set(name, encryptedName);
  }

  for (const name of readdirSync(directory)) {
    if (CATALOG_BIN_PATTERN.test(name) && !encryptedNames.has(name.replace(/\.bin$/, '.json'))) {
      unlinkSync(join(directory, name));
    }
  }

  const manifestPath = join(directory, 'wallpapers.catalog.json');
  if (!existsSync(manifestPath)) throw new Error(`缺少壁纸目录 manifest：${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
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
  if (manifest.bootstrap)
    manifest.bootstrapFileSize = readFileSync(join(directory, manifest.bootstrap)).length;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

if (process.argv[1] && basename(process.argv[1]) === basename(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) {
    console.error('用法：node encrypt-wallpaper-catalog.mjs <目录>');
    process.exit(1);
  }
  encryptCatalogDirectory(directory);
  console.log(`[wallpapers] 已加密目录：${directory}`);
}
