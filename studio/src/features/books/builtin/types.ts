import type { BookFormat } from '../types/reader';

export interface BuiltinBookDef {
  /** 唯一标识，即书籍文件名（不含路径与扩展名）。 */
  slug: string;
  /** 兜底标题，即文件名（不含扩展名）；打开后由内容元数据覆盖。 */
  title: string;
  format: BookFormat;
  /** 绝对路径，例如 /books/xxx.epub。 */
  url: string;
}

const EXTENSION_FORMATS: Record<string, BookFormat> = {
  '.txt': 'txt',
  '.pdf': 'pdf',
  '.epub': 'epub',
  '.mobi': 'mobi',
  '.azw3': 'azw3',
  '.fb2': 'fb2',
  '.cbz': 'cbz',
};

export function formatForFileName(fileName: string): BookFormat | null {
  const index = fileName.lastIndexOf('.');
  if (index < 0) return null;
  return EXTENSION_FORMATS[fileName.slice(index).toLowerCase()] ?? null;
}

export function titleForFileName(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return (index > 0 ? fileName.slice(0, index) : fileName).trim();
}

/** 文件名去扩展名后保持原样，不做 trim：slug 需要精确还原书库文件名以构造 URL。 */
export function slugForFileName(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index > 0 ? fileName.slice(0, index) : fileName;
}
