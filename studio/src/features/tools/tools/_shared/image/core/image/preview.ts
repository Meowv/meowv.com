import { readImageDimensions } from './dimensions';
import { detectImageMime } from './formats';
import { sanitizeSvgSource } from './svg';
import type { PreviewImageRequest, PreviewImageResponse } from '../../workers/image-preview.worker';

export type ImagePreviewPurpose = 'display' | 'thumbnail';

type PreviewImageKind = PreviewImageRequest['kind'];

interface PendingPreview {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
}

const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);
const TIFF_EXTENSIONS = new Set(['.tif', '.tiff']);
const PSD_EXTENSIONS = new Set(['.psd']);
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);
const TIFF_MIME_TYPES = new Set(['image/tif', 'image/tiff', 'image/x-tiff']);
const PSD_MIME_TYPES = new Set(['image/vnd.adobe.photoshop', 'image/x-photoshop']);
const THUMBNAIL_MAX_EDGE = 512;

let previewWorker: Worker | null = null;
let requestSequence = 0;
const pendingPreviews = new Map<number, PendingPreview>();

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index).toLowerCase();
}

async function previewImageKind(file: Blob): Promise<PreviewImageKind | null> {
  const extension = file instanceof File ? extensionOf(file.name) : '';
  const mime = file.type.trim().toLowerCase();
  if (HEIC_EXTENSIONS.has(extension) || HEIC_MIME_TYPES.has(mime)) {
    return 'heic';
  }
  if (TIFF_EXTENSIONS.has(extension) || TIFF_MIME_TYPES.has(mime)) {
    return 'tiff';
  }
  if (PSD_EXTENSIONS.has(extension) || PSD_MIME_TYPES.has(mime)) {
    return 'psd';
  }

  const detectedMime = await detectImageMime(file);
  if (detectedMime === 'image/heic') {
    return 'heic';
  }
  if (detectedMime === 'image/tiff') {
    return 'tiff';
  }
  if (detectedMime === 'image/vnd.adobe.photoshop') {
    return 'psd';
  }
  return null;
}

function rejectPendingPreviews(message: string): void {
  const error = new Error(message);
  for (const pending of pendingPreviews.values()) {
    pending.reject(error);
  }
  pendingPreviews.clear();
}

function resetPreviewWorker(message?: string): void {
  previewWorker?.terminate();
  previewWorker = null;
  if (message) {
    rejectPendingPreviews(message);
  }
}

function ensurePreviewWorker(): Worker {
  if (previewWorker) {
    return previewWorker;
  }
  if (typeof Worker === 'undefined') {
    throw new Error('当前浏览器不支持后台图片解码');
  }

  const worker = new Worker(new URL('../../workers/image-preview.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.addEventListener('message', (event: MessageEvent<PreviewImageResponse>) => {
    const response = event.data;
    const pending = pendingPreviews.get(response.id);
    if (!pending) {
      return;
    }
    pendingPreviews.delete(response.id);
    if (response.ok) {
      pending.resolve(new Blob([response.buffer], { type: response.mime }));
      return;
    }
    pending.reject(new Error(response.error));
  });
  worker.addEventListener('error', () => {
    resetPreviewWorker('图片解码服务异常，请重试。');
  });
  previewWorker = worker;
  return worker;
}

async function decodeSpecialImage(
  file: Blob,
  kind: PreviewImageKind,
  purpose: ImagePreviewPurpose,
): Promise<Blob> {
  await readImageDimensions(file);
  const buffer = await file.arrayBuffer();
  const id = ++requestSequence;
  const worker = ensurePreviewWorker();
  const request: PreviewImageRequest = {
    id,
    kind,
    buffer,
    mime: file.type,
    ...(purpose === 'thumbnail' ? { maxEdge: THUMBNAIL_MAX_EDGE } : {}),
  };

  return new Promise<Blob>((resolve, reject) => {
    pendingPreviews.set(id, { resolve, reject });
    worker.postMessage(request, [buffer]);
  });
}

export async function createImagePreviewBlob(
  file: Blob,
  purpose: ImagePreviewPurpose = 'display',
): Promise<Blob> {
  const kind = await previewImageKind(file);
  if (!kind) {
    return (await detectImageMime(file)) === 'image/svg+xml' ? sanitizeSvgSource(file) : file;
  }

  try {
    return await decodeSpecialImage(file, kind, purpose);
  } catch (error) {
    const format = kind === 'heic' ? 'HEIC/HEIF' : kind === 'tiff' ? 'TIFF' : 'PSD';
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${format} 图片解码失败：${message}`);
  }
}

export function disposeImagePreviewDecoder(): void {
  resetPreviewWorker('图片解码已取消。');
}
