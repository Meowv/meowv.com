import { describe, expect, it } from 'vitest';
import { detectBookFormat } from './format-detection';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function bytesOf(size: number, prefix: number[] = []): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set(prefix, 0);
  return bytes;
}

/** 构造带 BOOKMOBI 头的最小 MOBI 容器，recordOffset 处写入指定版本号。 */
function mobiBytes(version: number): Uint8Array<ArrayBuffer> {
  const recordOffset = 200;
  const bytes = new Uint8Array(recordOffset + 64);
  const view = new DataView(bytes.buffer);

  for (const [index, character] of [...'BOOKMOBI'].entries()) {
    bytes[60 + index] = character.charCodeAt(0);
  }
  view.setUint32(78, recordOffset, false);
  view.setUint32(recordOffset + 36, version, false);

  return bytes;
}

describe('detectBookFormat', () => {
  it('通过 %PDF- 魔数识别 PDF', async () => {
    expect(await detectBookFormat(new File([bytesOf(96, PDF_MAGIC)], '任意名字.bin'))).toBe('pdf');
  });

  it('通过 BOOKMOBI 头与容器版本区分 mobi 与 azw3', async () => {
    expect(await detectBookFormat(new File([mobiBytes(6)], 'a.mobi'))).toBe('mobi');
    expect(await detectBookFormat(new File([mobiBytes(8)], 'a.mobi'))).toBe('azw3');
    expect(await detectBookFormat(new File([mobiBytes(10)], 'a.mobi'))).toBe('azw3');
  });

  it('扩展名为 azw3 时直接判定，不再读取容器版本', async () => {
    expect(await detectBookFormat(new File([mobiBytes(6)], 'a.azw3'))).toBe('azw3');
  });

  it('通过 ZIP 魔数区分 epub 与 cbz', async () => {
    expect(await detectBookFormat(new File([bytesOf(96, ZIP_MAGIC)], 'a.zip'))).toBe('epub');
    expect(await detectBookFormat(new File([bytesOf(96, ZIP_MAGIC)], 'a.cbz'))).toBe('cbz');
  });

  it('通过漫画 MIME 把 ZIP 判定为 cbz', async () => {
    const file = new File([bytesOf(96, ZIP_MAGIC)], 'a.zip', {
      type: 'application/vnd.comicbook+zip',
    });

    expect(await detectBookFormat(file)).toBe('cbz');
  });

  it('通过扩展名识别 fb2', async () => {
    expect(await detectBookFormat(new File([bytesOf(32)], 'a.fb2'))).toBe('fb2');
  });

  it('通过 fictionbook MIME 识别 fb2', async () => {
    const file = new File([bytesOf(32)], 'a.bin', {
      type: 'application/x-fictionbook+xml',
    });

    expect(await detectBookFormat(file)).toBe('fb2');
  });

  it('通过 text/ 前缀的 MIME 识别 txt', async () => {
    const file = new File(['纯文本内容'], 'a.bin', { type: 'text/plain' });

    expect(await detectBookFormat(file)).toBe('txt');
  });

  it('在没有魔数线索时按扩展名兜底', async () => {
    expect(await detectBookFormat(new File(['内容'], 'a.txt'))).toBe('txt');
    expect(await detectBookFormat(new File(['内容'], 'a.epub'))).toBe('epub');
    expect(await detectBookFormat(new File(['内容'], 'a.cbz'))).toBe('cbz');
    expect(await detectBookFormat(new File(['内容'], 'a.mobi'))).toBe('mobi');
    expect(await detectBookFormat(new File(['内容'], 'a.azw3'))).toBe('azw3');
  });

  it('扩展名大小写不敏感', async () => {
    expect(await detectBookFormat(new File([bytesOf(96, PDF_MAGIC)], 'A.PDF'))).toBe('pdf');
  });

  it('空文件抛出可读错误', async () => {
    await expect(detectBookFormat(new File([], 'a.pdf'))).rejects.toThrow('文件内容为空。');
  });

  it('无法识别的格式抛出支持列表提示', async () => {
    await expect(detectBookFormat(new File(['内容'], 'a.xyz'))).rejects.toThrow(
      '暂不支持这种书籍格式。请选择 PDF、EPUB、TXT、MOBI、AZW3、FB2 或 CBZ。',
    );
  });

  it('已取消的信号立即抛出 AbortError', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      detectBookFormat(new File([bytesOf(96, PDF_MAGIC)], 'a.pdf'), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
