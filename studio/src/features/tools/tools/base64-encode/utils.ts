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
