import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { parsePageRanges } from '@/features/pdf/core/shared/ranges';

export const MAX_OCR_PDF_PAGES = 20;

export interface OcrPageRangeResult {
  pages: number[];
  error: string;
}

interface PdfTextItem {
  str?: unknown;
  hasEOL?: unknown;
}

function isPdfTextItem(value: unknown): value is PdfTextItem {
  return typeof value === 'object' && value !== null && 'str' in value;
}

export function parseOcrPageRange(input: string, pageCount: number): OcrPageRangeResult {
  const parsed = parsePageRanges(input, pageCount);
  if (!parsed.valid) return { pages: [], error: parsed.error };

  const pages: number[] = [];
  const seen = new Set<number>();
  for (const group of parsed.groups) {
    for (const page of group.pages) {
      if (seen.has(page)) {
        return { pages: [], error: `页码 ${page} 重复，请每页只选择一次。` };
      }
      seen.add(page);
      pages.push(page);
    }
  }

  if (pages.length > MAX_OCR_PDF_PAGES) {
    return { pages: [], error: `单次最多识别 ${MAX_OCR_PDF_PAGES} 页。` };
  }

  return { pages, error: '' };
}

export async function extractPdfPageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  let text = '';

  for (const item of content.items) {
    if (!isPdfTextItem(item) || typeof item.str !== 'string') continue;
    text += item.str;
    text += item.hasEOL ? '\n' : ' ';
  }

  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hasUsablePdfText(text: string): boolean {
  return Boolean(text.replace(/\s/g, ''));
}

export async function renderPdfPageForOcr(page: PDFPageProxy): Promise<Blob> {
  const baseViewport = page.getViewport({ scale: 1 });
  const maxDimension = 3_000;
  const scale = Math.min(2, maxDimension / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale: Math.max(scale, 0.5) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  try {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法创建页面画布。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('浏览器无法生成页面图片。'));
      }, 'image/png');
    });
    return blob;
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

export async function renderPdfPreview(
  document: PDFDocumentProxy,
  pageNumber: number,
): Promise<Blob> {
  const page = await document.getPage(pageNumber);
  try {
    return await renderPdfPageForOcr(page);
  } finally {
    page.cleanup();
  }
}
