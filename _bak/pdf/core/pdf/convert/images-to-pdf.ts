import { PDFDocument, rgb } from "pdf-lib";
import type { PdfOperationResult } from "../types";
import { decodeImageFile } from "../shared/canvas";
import { mapPdfError } from "../shared/errors";
import { sanitizeFileName, stripFileExtension } from "../shared/naming";
import { createGeneratedFile, createOperationResult } from "../shared/result";

export type ImagePageSize = "fit" | "a4" | "a3" | "letter" | "custom";
export type ImagePageOrientation = "auto" | "portrait" | "landscape";
export type ImageLayout = "contain" | "cover" | "original";

export interface ImagesToPdfOptions {
  outputName: string;
  pageSize: ImagePageSize;
  orientation: ImagePageOrientation;
  layout: ImageLayout;
  margin: number;
  background: string;
  quality: number;
  customWidthMm: number;
  customHeightMm: number;
}

interface PreparedImage {
  bytes: Uint8Array;
  type: "png" | "jpeg";
  width: number;
  height: number;
}

const PAGE_SIZES: Record<Exclude<ImagePageSize, "fit" | "custom">, [number, number]> = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  letter: [612, 792]
};

function millimetersToPoints(value: number): number {
  return (value * 72) / 25.4;
}

function parseColor(hex: string): [number, number, number] {
  const match = hex.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!match) {
    return [1, 1, 1];
  }
  return [
    Number.parseInt(match[1]!, 16) / 255,
    Number.parseInt(match[2]!, 16) / 255,
    Number.parseInt(match[3]!, 16) / 255
  ];
}

function canvasToBytes(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("图片编码失败"));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      mimeType,
      quality
    );
  });
}

async function prepareImage(file: File, quality: number): Promise<PreparedImage> {
  const decoded = await decodeImageFile(file);
  try {
    const preservePng = file.type === "image/png" && quality >= 0.98;

    if (preservePng) {
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        type: "png",
        width: decoded.width,
        height: decoded.height
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    try {
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("无法创建图片画布");
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0);
      return {
        bytes: await canvasToBytes(canvas, "image/jpeg", quality),
        type: "jpeg",
        width: decoded.width,
        height: decoded.height
      };
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  } finally {
    decoded.close();
  }
}

function resolvePageSize(image: PreparedImage, options: ImagesToPdfOptions): [number, number] {
  let size: [number, number];
  if (options.pageSize === "fit") {
    size = [image.width * 0.75, image.height * 0.75];
  } else if (options.pageSize === "custom") {
    size = [
      millimetersToPoints(Math.max(20, options.customWidthMm)),
      millimetersToPoints(Math.max(20, options.customHeightMm))
    ];
  } else {
    size = [...PAGE_SIZES[options.pageSize]];
  }

  const imageIsLandscape = image.width > image.height;
  const shouldLandscape =
    options.orientation === "landscape" || (options.orientation === "auto" && imageIsLandscape);
  if ((shouldLandscape && size[0] < size[1]) || (!shouldLandscape && size[0] > size[1])) {
    size = [size[1], size[0]];
  }
  return size;
}

export async function imagesToPdf(
  files: File[],
  options: ImagesToPdfOptions,
  signal?: AbortSignal,
  onProgress?: (current: number, total: number) => void
): Promise<PdfOperationResult> {
  const startedAt = performance.now();
  if (files.length === 0) {
    throw new Error("请至少添加一张图片。");
  }

  try {
    const pdf = await PDFDocument.create();
    const [red, green, blue] = parseColor(options.background);

    for (const [index, file] of files.entries()) {
      if (signal?.aborted) {
        throw new DOMException("处理已取消", "AbortError");
      }

      const prepared = await prepareImage(file, options.quality);
      const embedded =
        prepared.type === "png"
          ? await pdf.embedPng(prepared.bytes)
          : await pdf.embedJpg(prepared.bytes);
      const [pageWidth, pageHeight] = resolvePageSize(prepared, options);
      const page = pdf.addPage([pageWidth, pageHeight]);
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: rgb(red, green, blue)
      });

      const availableWidth = Math.max(1, pageWidth - options.margin * 2);
      const availableHeight = Math.max(1, pageHeight - options.margin * 2);
      let width = embedded.width;
      let height = embedded.height;

      if (options.layout !== "original") {
        const containScale = Math.min(availableWidth / width, availableHeight / height);
        const coverScale = Math.max(availableWidth / width, availableHeight / height);
        const scale = options.layout === "cover" ? coverScale : containScale;
        width *= scale;
        height *= scale;
      } else {
        const safeScale = Math.min(1, availableWidth / width, availableHeight / height);
        width *= safeScale;
        height *= safeScale;
      }

      page.drawImage(embedded, {
        x: (pageWidth - width) / 2,
        y: (pageHeight - height) / 2,
        width,
        height
      });
      onProgress?.(index + 1, files.length);
    }

    pdf.setProducer("Meowv PDF");
    pdf.setCreationDate(new Date());
    const bytes = await pdf.save({ useObjectStreams: true });
    const name = sanitizeFileName(stripFileExtension(options.outputName), "pdf", "images");
    return createOperationResult([createGeneratedFile(name, bytes)], startedAt);
  } catch (error) {
    throw mapPdfError(error);
  }
}
