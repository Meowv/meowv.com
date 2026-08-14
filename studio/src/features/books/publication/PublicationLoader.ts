import type { Publication, PublicationProgress } from '../types/reader';
import { CbzPublication } from './cbz/CbzPublication';
import { FoliatePublication } from './foliate/FoliatePublication';
import { PdfPublication } from './pdf/PdfPublication';
import { TxtPublication } from './txt/TxtPublication';
import { detectBookFormat } from './format-detection';

export const BOOK_FILE_ACCEPT =
  '.pdf,.epub,.txt,.mobi,.azw3,.fb2,.cbz,application/pdf,application/epub+zip,text/plain,application/x-fictionbook+xml,application/vnd.comicbook+zip,application/x-mobipocket-ebook';

export interface PublicationLoadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PublicationProgress) => void;
}

export class PublicationLoader {
  static async open(file: File, options: PublicationLoadOptions = {}): Promise<Publication> {
    options.onProgress?.({ stage: 'detecting', value: 0.04, message: '正在识别书籍…' });
    const format = await detectBookFormat(file, options.signal);
    options.onProgress?.({ stage: 'parsing', value: 0.12, message: '正在解析章节…' });
    if (format === 'pdf') {
      return PdfPublication.open(file, { signal: options.signal });
    }
    if (format === 'cbz') return CbzPublication.open(file, options.signal);
    if (format === 'txt') return TxtPublication.open(file, options.signal);
    return FoliatePublication.open(file, { format, signal: options.signal });
  }
}
