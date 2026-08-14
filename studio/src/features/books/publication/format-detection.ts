import type { BookFormat } from '../types/reader';

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('书籍识别已取消。', 'AbortError');
}

function extensionFor(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export async function detectBookFormat(file: File, signal?: AbortSignal): Promise<BookFormat> {
  assertNotAborted(signal);
  if (!file.size) throw new Error('文件内容为空。');
  const extension = extensionFor(file);
  const head = new Uint8Array(await file.slice(0, 96).arrayBuffer());
  assertNotAborted(signal);
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (String.fromCharCode(...head.subarray(60, 68)) === 'BOOKMOBI') {
    if (extension === 'azw3') return 'azw3';
    const recordOffset = new DataView(head.buffer).getUint32(78, false);
    const recordHeader = new Uint8Array(
      await file.slice(recordOffset, recordOffset + 64).arrayBuffer(),
    );
    assertNotAborted(signal);
    const version =
      recordHeader.length >= 40 ? new DataView(recordHeader.buffer).getUint32(36, false) : 0;
    return version >= 8 ? 'azw3' : 'mobi';
  }
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    if (extension === 'cbz' || file.type === 'application/vnd.comicbook+zip') return 'cbz';
    return 'epub';
  }
  if (extension === 'fb2' || file.type === 'application/x-fictionbook+xml') return 'fb2';
  if (extension === 'txt' || file.type.startsWith('text/')) return 'txt';
  if (extension === 'epub') return 'epub';
  if (extension === 'cbz') return 'cbz';
  if (extension === 'mobi') return 'mobi';
  if (extension === 'azw3') return 'azw3';
  throw new Error('暂不支持这种书籍格式。请选择 PDF、EPUB、TXT、MOBI、AZW3、FB2 或 CBZ。');
}
