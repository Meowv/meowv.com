import { zipSync } from 'fflate';
import type { DrawCommand, WorksheetPage } from './types';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  BUILT_IN_FONT_FAMILIES,
  mmToPx,
  pagePngFilename,
} from './worksheet';

interface HanziData {
  strokes: string[];
}

export interface PdfImagePage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

const hanziDataCache = new Map<string, Promise<HanziData | null>>();

export async function loadHanziData(character: string): Promise<HanziData | null> {
  const existing = hanziDataCache.get(character);
  if (existing) return existing;

  const request = fetch(getHanziDataUrl(character), {
    credentials: 'same-origin',
    cache: 'force-cache',
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as Partial<HanziData>;
      return Array.isArray(data.strokes) ? ({ strokes: data.strokes } as HanziData) : null;
    })
    .catch(() => null);
  hanziDataCache.set(character, request);
  return request;
}

export function getHanziDataUrl(character: string): string {
  return `/zitie/hanzi-data/${encodeURIComponent(character)}.json`;
}

export function strokeFallbackWarning(character: string): string {
  return `“${character}”暂无笔顺数据，已使用字形替代。`;
}

export async function renderWorksheetPage(
  canvas: HTMLCanvasElement,
  page: WorksheetPage,
  dpi: number,
): Promise<string[]> {
  const width = mmToPx(A4_WIDTH_MM, dpi);
  const height = mmToPx(A4_HEIGHT_MM, dpi);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('当前浏览器无法创建画布。');
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.scale(width / A4_WIDTH_MM, height / A4_HEIGHT_MM);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (typeof document !== 'undefined' && 'fonts' in document) {
    const usesPenControlFont = page.commands.some((command) => command.kind === 'pattern');
    if (usesPenControlFont) {
      // 控笔图案依赖图标字体；先按实际会用到的字重完成加载，避免画布首帧回退为字母或数字。
      await Promise.all([
        document.fonts.load('400 16px "Practice Pen Control"'),
        document.fonts.load('700 16px "Practice Pen Control"'),
      ]);
    }
    await document.fonts.ready;
  }

  const warnings = new Set(page.warnings);
  for (const command of page.commands) {
    if (command.kind === 'grid') drawGrid(context, command);
    if (command.kind === 'text') drawText(context, command);
    if (command.kind === 'pattern') drawPattern(context, command);
    if (command.kind === 'stroke') {
      const warning = await drawStroke(context, command);
      if (warning) warnings.add(warning);
    }
  }
  return Array.from(warnings);
}

function drawGrid(
  context: CanvasRenderingContext2D,
  command: Extract<DrawCommand, { kind: 'grid' }>,
) {
  const { x, y, width, height, style } = command;
  context.save();
  context.lineWidth = 0.18;
  context.strokeStyle = command.color;
  context.globalAlpha = 0.78;
  context.setLineDash([]);

  if (style === 'horizontal') {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + width, y);
    context.moveTo(x, y + height);
    context.lineTo(x + width, y + height);
    context.stroke();
    context.restore();
    return;
  }

  context.strokeRect(x, y, width, height);
  if (style === 'square' || style === 'none') {
    context.restore();
    return;
  }

  context.globalAlpha = 0.42;
  context.lineWidth = 0.13;
  context.setLineDash([0.7, 0.65]);
  context.beginPath();

  if (style === 'fourLine') {
    for (let line = 1; line < 3; line += 1) {
      const lineY = y + (height * line) / 3;
      context.moveTo(x, lineY);
      context.lineTo(x + width, lineY);
    }
  } else if (style === 'composition') {
    const topLine = y + height * 0.3;
    context.moveTo(x, topLine);
    context.lineTo(x + width, topLine);
    context.moveTo(x + width / 2, topLine);
    context.lineTo(x + width / 2, y + height);
  } else if (style === 'jiuGong') {
    for (let line = 1; line < 3; line += 1) {
      context.moveTo(x + (width * line) / 3, y);
      context.lineTo(x + (width * line) / 3, y + height);
      context.moveTo(x, y + (height * line) / 3);
      context.lineTo(x + width, y + (height * line) / 3);
    }
  } else {
    context.moveTo(x + width / 2, y);
    context.lineTo(x + width / 2, y + height);
    context.moveTo(x, y + height / 2);
    context.lineTo(x + width, y + height / 2);
    if (style === 'mi' || style === 'huiMi') {
      context.moveTo(x, y);
      context.lineTo(x + width, y + height);
      context.moveTo(x + width, y);
      context.lineTo(x, y + height);
    }
  }
  context.stroke();

  if (['huiGong', 'huiTian', 'huiMi'].includes(style)) {
    context.setLineDash([]);
    context.globalAlpha = 0.5;
    context.strokeRect(x + width * 0.2, y + height * 0.2, width * 0.6, height * 0.6);
  }
  context.restore();
}

function drawText(
  context: CanvasRenderingContext2D,
  command: Extract<DrawCommand, { kind: 'text' }>,
) {
  context.save();
  context.globalAlpha = command.opacity;
  context.fillStyle = command.color;
  context.textAlign = command.align;
  context.textBaseline = command.baseline;
  context.font = `${command.fontWeight === 'bold' ? 700 : 400} ${command.fontSizeMm}px ${command.fontFamily}`;
  context.fillText(command.text, command.x, command.y, command.width);
  context.restore();
}

async function drawStroke(
  context: CanvasRenderingContext2D,
  command: Extract<DrawCommand, { kind: 'stroke' }>,
): Promise<string | null> {
  const data = await loadHanziData(command.character);
  if (!data?.strokes.length || typeof Path2D === 'undefined') {
    drawText(context, {
      kind: 'text',
      x: command.x + command.width / 2,
      y: command.y + command.height / 2,
      width: command.width,
      height: command.height,
      text: command.character,
      fontSizeMm: command.height * 0.76,
      fontFamily: command.fallbackFontFamily,
      fontWeight: 'normal',
      color: command.color,
      opacity: command.opacity,
      align: 'center',
      baseline: 'middle',
    });
    return strokeFallbackWarning(command.character);
  }

  const visibleCount = Math.max(
    1,
    Math.min(data.strokes.length, Math.ceil(data.strokes.length * command.progress)),
  );
  context.save();
  context.beginPath();
  context.rect(command.x, command.y, command.width, command.height);
  context.clip();
  const side = Math.min(command.width, command.height);
  const padding = side * 0.05;
  const inner = side - padding * 2;
  const scale = inner / 1024;
  context.translate(
    command.x + (command.width - inner) / 2,
    command.y + (command.height - inner) / 2 + inner * 0.9,
  );
  context.scale(scale, -scale);

  data.strokes.forEach((strokePath, index) => {
    context.save();
    context.globalAlpha =
      index < visibleCount ? command.opacity : Math.min(0.06, command.opacity * 0.1);
    context.fillStyle = command.color;
    context.fill(new Path2D(strokePath));
    context.restore();
  });
  context.restore();
  return null;
}

function drawPattern(
  context: CanvasRenderingContext2D,
  command: Extract<DrawCommand, { kind: 'pattern' }>,
) {
  context.save();
  context.fillStyle = command.color;
  context.globalAlpha = command.opacity;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${command.weight === 'bold' ? 700 : 400} ${command.height * 0.82}px ${BUILT_IN_FONT_FAMILIES.penControl}`;
  context.fillText(
    command.pattern,
    command.x + command.width / 2,
    command.y + command.height / 2,
    command.width * 0.9,
  );
  context.restore();
}

async function canvasBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
  quality?: number,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片生成失败。'))),
      type,
      quality,
    );
  });
}

export async function createPagePngBlob(page: WorksheetPage, dpi = 300): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await renderWorksheetPage(canvas, page, dpi);
  return canvasBlob(canvas, 'image/png');
}

export async function createPagesZipBlob(
  pages: WorksheetPage[],
  onProgress?: (current: number, total: number) => void,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < pages.length; index += 1) {
    const blob = await createPagePngBlob(pages[index], 300);
    files[pagePngFilename(index, pages.length)] = new Uint8Array(await blob.arrayBuffer());
    onProgress?.(index + 1, pages.length);
  }
  const archive = new Uint8Array(packPagePngFiles(files));
  return new Blob([archive.buffer], { type: 'application/zip' });
}

export function packPagePngFiles(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 0 });
}

export async function createPrintPageUrls(pages: WorksheetPage[], dpi = 144): Promise<string[]> {
  const urls: string[] = [];
  try {
    for (const page of pages) {
      const blob = await createPagePngBlob(page, dpi);
      urls.push(URL.createObjectURL(blob));
    }
    return urls;
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }
}

export function revokeObjectUrls(urls: string[]) {
  urls.forEach((url) => URL.revokeObjectURL(url));
}

export async function createPagesPdfBlob(
  pages: WorksheetPage[],
  onProgress?: (current: number, total: number) => void,
): Promise<Blob> {
  const images: PdfImagePage[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const canvas = document.createElement('canvas');
    await renderWorksheetPage(canvas, pages[index], 180);
    const jpeg = await canvasBlob(canvas, 'image/jpeg', 0.95);
    images.push({
      bytes: new Uint8Array(await jpeg.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    });
    onProgress?.(index + 1, pages.length);
  }
  const pdf = new Uint8Array(packJpegPagesIntoPdf(images));
  return new Blob([pdf.buffer], { type: 'application/pdf' });
}

export function packJpegPagesIntoPdf(images: PdfImagePage[]): Uint8Array {
  if (!images.length) throw new Error('PDF 至少需要一页。');
  const encoder = new TextEncoder();
  const encode = (value: string) => encoder.encode(value);
  const objects: Uint8Array[] = [];
  const kids = images.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  objects.push(encode('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.push(encode(`<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>`));

  const pageWidth = 595.276;
  const pageHeight = 841.89;
  images.forEach((image, index) => {
    const pageObject = 3 + index * 3;
    const contentObject = pageObject + 1;
    const imageObject = pageObject + 2;
    const imageName = `Im${index + 1}`;
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/${imageName} Do\nQ\n`;
    objects.push(
      encode(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /${imageName} ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
      ),
    );
    objects.push(encode(`<< /Length ${encode(content).length} >>\nstream\n${content}endstream`));
    objects.push(
      concatBytes([
        encode(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
        ),
        image.bytes,
        encode('\nendstream'),
      ]),
    );
  });

  const chunks: Uint8Array[] = [encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const wrapped = concatBytes([encode(`${index + 1} 0 obj\n`), object, encode('\nendobj\n')]);
    chunks.push(wrapped);
    length += wrapped.length;
  });

  const xrefOffset = length;
  const xrefRows = offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  chunks.push(
    encode(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefRows}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
    ),
  );
  return concatBytes(chunks);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
