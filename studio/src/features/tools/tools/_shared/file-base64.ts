export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  }
  return btoa(chunks.join(''));
}

export async function fileToDataUrl(file: File): Promise<string> {
  return `data:${file.type || 'application/octet-stream'};base64,${bytesToBase64(new Uint8Array(await file.arrayBuffer()))}`;
}

export function dataUrlToBlob(input: string, fallbackMime: string): Blob {
  const trimmed = input.trim();
  const match = trimmed.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  const encoded = (match?.[2] || trimmed).replace(/\s+/g, '');
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error('Base64 格式无效。');
  }
  try {
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
    return new Blob([Uint8Array.from(binary, (character) => character.charCodeAt(0))], {
      type: match?.[1] || fallbackMime || 'application/octet-stream',
    });
  } catch {
    throw new Error('Base64 内容无法解码。');
  }
}
