function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return btoa(chunks.join(''));
}

export async function imageToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${file.type || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
}

export async function base64ToImage(input: string, fallbackMime: string): Promise<Blob> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('请输入 Base64 图片内容。');
  const match = trimmed.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  const mime = match?.[1] || fallbackMime;
  const encoded = (match?.[2] || trimmed).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error('Base64 格式无效。');
  }
  let binary: string;
  try {
    binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
  } catch {
    throw new Error('Base64 内容无法解码。');
  }
  return new Blob([Uint8Array.from(binary, (value) => value.charCodeAt(0))], { type: mime });
}
