import { md5Bytes } from './hash';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2) throw new Error('十六进制内容无效。');
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (value) => Number.parseInt(value, 16));
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  }
  return btoa(chunks.join(''));
}

export function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value.replace(/\s+/g, ''));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Base64 内容无效。');
  }
}

function base64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
}

export async function hmacText(
  algorithm: 'MD5' | 'SHA-256',
  keyText: string,
  message: string,
): Promise<string> {
  const messageBytes = encoder.encode(message);
  let keyBytes = encoder.encode(keyText);
  if (algorithm === 'SHA-256') {
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, messageBytes)));
  }
  const blockSize = 64;
  if (keyBytes.length > blockSize) keyBytes = new Uint8Array(hexToBytes(md5Bytes(keyBytes)));
  const padded = new Uint8Array(blockSize);
  padded.set(keyBytes);
  const innerKey = padded.map((value) => value ^ 0x36);
  const outerKey = padded.map((value) => value ^ 0x5c);
  const inner = new Uint8Array(innerKey.length + messageBytes.length);
  inner.set(innerKey);
  inner.set(messageBytes, innerKey.length);
  const innerDigest = hexToBytes(md5Bytes(inner));
  const outer = new Uint8Array(outerKey.length + innerDigest.length);
  outer.set(outerKey);
  outer.set(innerDigest, outerKey.length);
  return md5Bytes(outer);
}

function uuidFromBytes(bytes: Uint8Array): string {
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidV1(): string {
  const timestamp = BigInt(Date.now()) * 10_000n + 0x01b21dd213814000n;
  const bytes = new Uint8Array(16);
  const timeLow = Number(timestamp & 0xffffffffn);
  const timeMid = Number((timestamp >> 32n) & 0xffffn);
  const timeHigh = Number((timestamp >> 48n) & 0x0fffn) | 0x1000;
  const view = new DataView(bytes.buffer);
  view.setUint32(0, timeLow);
  view.setUint16(4, timeMid);
  view.setUint16(6, timeHigh);
  const random = crypto.getRandomValues(new Uint8Array(8));
  bytes[8] = (random[0] & 0x3f) | 0x80;
  bytes[9] = random[1];
  bytes.set(random.subarray(2), 10);
  bytes[10] |= 0x01;
  return uuidFromBytes(bytes);
}

export function uuidV7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return uuidFromBytes(bytes);
}

export function guidV4(): string {
  return crypto.randomUUID();
}

async function hmacSha256Bytes(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

export async function encodeJwt(payloadSource: string, secret: string): Promise<string> {
  if (!secret) throw new Error('请输入 HMAC 密钥。');
  let payload: unknown;
  try {
    payload = JSON.parse(payloadSource);
  } catch {
    throw new Error('Payload 必须是有效 JSON。');
  }
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${base64Url(await hmacSha256Bytes(secret, unsigned))}`;
}

export function decodeJwtParts(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
} {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('JWT 必须包含三个部分。');
  try {
    const header = JSON.parse(decoder.decode(decodeBase64Url(parts[0])));
    const payload = JSON.parse(decoder.decode(decodeBase64Url(parts[1])));
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
      throw new Error();
    }
    return { header, payload, signature: parts[2] };
  } catch {
    throw new Error('JWT Header 或 Payload 不是有效 JSON。');
  }
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<{
  validSignature: boolean;
  timeValid: boolean;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  messages: string[];
}> {
  if (!secret) throw new Error('请输入 HMAC 密钥。');
  const parts = token.trim().split('.');
  const decoded = decodeJwtParts(token);
  if (decoded.header.alg !== 'HS256') throw new Error('当前仅验证 HS256 JWT。');
  const expected = await hmacSha256Bytes(secret, `${parts[0]}.${parts[1]}`);
  const actual = decodeBase64Url(parts[2]);
  let difference = expected.length ^ actual.length;
  for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
    difference |= (expected[index] ?? 0) ^ (actual[index] ?? 0);
  }
  const now = Math.floor(Date.now() / 1000);
  const exp = typeof decoded.payload.exp === 'number' ? decoded.payload.exp : undefined;
  const nbf = typeof decoded.payload.nbf === 'number' ? decoded.payload.nbf : undefined;
  const messages: string[] = [];
  if (exp !== undefined && now >= exp) messages.push('Token 已超过 exp 过期时间。');
  if (nbf !== undefined && now < nbf) messages.push('Token 尚未到 nbf 生效时间。');
  return {
    validSignature: difference === 0,
    timeValid: messages.length === 0,
    header: decoded.header,
    payload: decoded.payload,
    messages,
  };
}

async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  if (!password) throw new Error('请输入加密密码。');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 210_000 },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

export async function aesEncrypt(plainText: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, ['encrypt']);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plainText)),
  );
  return JSON.stringify(
    {
      version: 1,
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: 210000,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(cipher),
    },
    null,
    2,
  );
}

export async function aesDecrypt(source: string, password: string): Promise<string> {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(source);
  } catch {
    throw new Error('加密数据必须是有效 JSON。');
  }
  if (
    payload.algorithm !== 'AES-256-GCM' ||
    typeof payload.salt !== 'string' ||
    typeof payload.iv !== 'string' ||
    typeof payload.ciphertext !== 'string'
  ) {
    throw new Error('加密数据结构无效。');
  }
  const salt = new Uint8Array(base64ToBytes(payload.salt));
  const iv = new Uint8Array(base64ToBytes(payload.iv));
  const key = await deriveAesKey(password, salt, ['decrypt']);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      new Uint8Array(base64ToBytes(payload.ciphertext)),
    );
    return decoder.decode(plain);
  } catch {
    throw new Error('解密失败：密码错误或密文已损坏。');
  }
}

function pem(label: string, bytes: ArrayBuffer): string {
  const base64 = bytesToBase64(new Uint8Array(bytes));
  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? base64;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

export async function generateRsaKeyPair(length: 2048 | 3072 | 4096): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: length,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  )) as CryptoKeyPair;
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey('spki', pair.publicKey),
    crypto.subtle.exportKey('pkcs8', pair.privateKey),
  ]);
  return { publicKey: pem('PUBLIC KEY', publicKey), privateKey: pem('PRIVATE KEY', privateKey) };
}
