function bytesToBinary(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return chunks.join('');
}

export function encodeBase64(input: string): string {
  return btoa(bytesToBinary(new TextEncoder().encode(input)));
}

function normalizeBase64(input: string): string {
  const value = input
    .trim()
    .replace(/^data:[^;,]+;base64,/i, '')
    .replace(/\s+/g, '');
  if (!value) throw new Error('请输入需要解码的 Base64 内容。');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new Error('Base64 格式无效，请检查字符和补位符。');
  }
  return value.padEnd(Math.ceil(value.length / 4) * 4, '=');
}

export function decodeBase64(input: string): string {
  let binary: string;
  try {
    binary = atob(normalizeBase64(input));
  } catch {
    throw new Error('Base64 格式无效，无法完成解码。');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('解码结果不是有效的 UTF-8 文本。');
  }
}
