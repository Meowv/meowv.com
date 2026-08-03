import { degrees, PDFArray, PDFDocument } from 'pdf-lib';
import type { PdfOperationResult } from '../types';
import { normalizeImageForPdf, renderTextToPng } from '../shared/canvas';
import { mapPdfError } from '../shared/errors';
import { sanitizeFileName, stripFileExtension } from '../shared/naming';
import { createGeneratedFile, createOperationResult } from '../shared/result';

export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';
export type WatermarkLayer = 'above' | 'below';

export interface WatermarkOptions {
  type: 'text' | 'image';
  text: string;
  image?: File;
  fontSize: number;
  color: string;
  opacity: number;
  rotation: number;
  tiled: boolean;
  horizontalGap: number;
  verticalGap: number;
  position: WatermarkPosition;
  layer?: WatermarkLayer;
  scale: number;
  pages: number[];
  outputName: string;
}

export function calculateWatermarkPosition(
  position: WatermarkPosition,
  pageWidth: number,
  pageHeight: number,
  width: number,
  height: number,
  margin = 28,
): { x: number; y: number } {
  const horizontal = position.endsWith('left')
    ? margin
    : position.endsWith('right')
      ? pageWidth - width - margin
      : (pageWidth - width) / 2;
  const vertical = position.startsWith('top')
    ? pageHeight - height - margin
    : position.startsWith('bottom')
      ? margin
      : (pageHeight - height) / 2;

  return {
    x: Math.max(margin, horizontal),
    y: Math.max(margin, vertical),
  };
}

export async function addWatermark(
  sourceBytes: Uint8Array,
  options: WatermarkOptions,
  signal?: AbortSignal,
  onProgress?: (current: number, total: number) => void,
): Promise<PdfOperationResult> {
  const startedAt = performance.now();
  if (options.type === 'text' && !options.text.trim()) {
    throw new Error('请输入水印文字。');
  }
  if (options.type === 'image' && !options.image) {
    throw new Error('请选择水印图片。');
  }

  try {
    const pdf = await PDFDocument.load(sourceBytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    let embedded;
    let sourceWidth: number;
    let sourceHeight: number;

    if (options.type === 'text') {
      const textAsset = await renderTextToPng(options.text.trim(), {
        fontSize: options.fontSize,
        color: options.color,
        fontWeight: 600,
      });
      embedded = await pdf.embedPng(textAsset.bytes);
      sourceWidth = textAsset.width;
      sourceHeight = textAsset.height;
    } else {
      const imageAsset = await normalizeImageForPdf(options.image!);
      embedded =
        imageAsset.type === 'png'
          ? await pdf.embedPng(imageAsset.bytes)
          : await pdf.embedJpg(imageAsset.bytes);
      sourceWidth = imageAsset.width;
      sourceHeight = imageAsset.height;
    }

    const selectedPages = new Set(options.pages);
    const pages = pdf.getPages();
    let processed = 0;

    for (const [index, page] of pages.entries()) {
      const pageNumber = index + 1;
      if (!selectedPages.has(pageNumber)) {
        continue;
      }
      if (signal?.aborted) {
        throw new DOMException('处理已取消', 'AbortError');
      }

      const { width: pageWidth, height: pageHeight } = page.getSize();
      const maxWidth = pageWidth * 0.72;
      const naturalScale = Math.min(1, maxWidth / sourceWidth);
      const width = Math.max(12, sourceWidth * naturalScale * options.scale);
      const height = Math.max(8, sourceHeight * naturalScale * options.scale);
      const draw = (x: number, y: number) =>
        page.drawImage(embedded, {
          x,
          y,
          width,
          height,
          opacity: options.opacity,
          rotate: degrees(options.rotation),
        });

      if (options.tiled) {
        const xStep = Math.max(width + options.horizontalGap, 40);
        const yStep = Math.max(height + options.verticalGap, 40);
        for (let y = -height; y < pageHeight + height; y += yStep) {
          for (let x = -width; x < pageWidth + width; x += xStep) {
            draw(x, y);
          }
        }
      } else {
        const position = calculateWatermarkPosition(
          options.position,
          pageWidth,
          pageHeight,
          width,
          height,
        );
        draw(position.x, position.y);
      }

      if (options.layer === 'below') {
        const contents = page.node.Contents();
        if (contents instanceof PDFArray && contents.size() > 1) {
          const watermarkStream = contents.get(contents.size() - 1);
          contents.remove(contents.size() - 1);
          contents.insert(0, watermarkStream);
        }
      }

      processed += 1;
      onProgress?.(processed, selectedPages.size);
    }

    pdf.setProducer('Meowv PDF');
    pdf.setModificationDate(new Date());
    const bytes = await pdf.save({ useObjectStreams: true });
    const name = sanitizeFileName(stripFileExtension(options.outputName), 'pdf', 'watermarked');
    return createOperationResult([createGeneratedFile(name, bytes)], startedAt);
  } catch (error) {
    throw mapPdfError(error);
  }
}
