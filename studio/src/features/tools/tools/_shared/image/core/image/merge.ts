import { createImagePreviewBlob } from './preview';
import { readImageDimensions } from './dimensions';

export interface MergeLayer {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MergeDocument {
  width: number;
  height: number;
  background: string;
  layers: MergeLayer[];
}

export interface MergeAsset {
  id: string;
  name: string;
  width: number;
  height: number;
  previewUrl: string;
  source: ImageBitmap | HTMLCanvasElement;
  dispose: () => void;
}

export type MergeMime = 'image/png' | 'image/jpeg' | 'image/webp';
export type MergeCorner = 'nw' | 'ne' | 'sw' | 'se';

export const MAX_MERGE_SIDE = 16_384;
export const MAX_MERGE_PIXELS = 32_000_000;
export const MAX_MERGE_IMAGES = 40;

export function assertMergeSize(width: number, height: number): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_MERGE_SIDE ||
    height > MAX_MERGE_SIDE ||
    width * height > MAX_MERGE_PIXELS
  ) {
    throw new Error('尺寸超出范围：宽高需为 1–16384 px，总像素不能超过 3200 万。');
  }
}

export function copyMergeDocument(value: MergeDocument): MergeDocument {
  return { ...value, layers: value.layers.map((layer) => ({ ...layer })) };
}

export function fitMergeDocument(value: MergeDocument): MergeDocument {
  if (value.layers.length === 0) return copyMergeDocument(value);
  const left = Math.floor(Math.min(...value.layers.map((layer) => layer.x)));
  const top = Math.floor(Math.min(...value.layers.map((layer) => layer.y)));
  const right = Math.ceil(Math.max(...value.layers.map((layer) => layer.x + layer.width)));
  const bottom = Math.ceil(Math.max(...value.layers.map((layer) => layer.y + layer.height)));
  assertMergeSize(right - left, bottom - top);
  return {
    ...value,
    width: right - left,
    height: bottom - top,
    layers: value.layers.map((layer) => ({ ...layer, x: layer.x - left, y: layer.y - top })),
  };
}

export function arrangeMergeDocument(
  value: MergeDocument,
  direction: 'horizontal' | 'vertical',
  gap: number,
): MergeDocument {
  let offset = 0;
  const horizontal = direction === 'horizontal';
  return fitMergeDocument({
    ...value,
    layers: value.layers.map((layer) => {
      const result = { ...layer, x: horizontal ? offset : 0, y: horizontal ? 0 : offset };
      offset += (horizontal ? layer.width : layer.height) + gap;
      return result;
    }),
  });
}

export function resizeMergeLayer(
  layer: MergeLayer,
  corner: MergeCorner,
  dx: number,
  dy: number,
): MergeLayer {
  const signX = corner.includes('w') ? -1 : 1;
  const signY = corner.includes('n') ? -1 : 1;
  // 将指针位移投影至图片对角线，四角缩放始终保持当前比例。
  const delta =
    (signX * dx * layer.width + signY * dy * layer.height) / (layer.width ** 2 + layer.height ** 2);
  const maxScale = Math.min(
    MAX_MERGE_SIDE / layer.width,
    MAX_MERGE_SIDE / layer.height,
    Math.sqrt(MAX_MERGE_PIXELS / (layer.width * layer.height)),
  );
  const scale = Math.max(
    Math.max(1 / layer.width, 1 / layer.height),
    Math.min(maxScale, 1 + delta),
  );
  const width = layer.width * scale;
  const height = layer.height * scale;
  return {
    ...layer,
    x: signX < 0 ? layer.x + layer.width - width : layer.x,
    y: signY < 0 ? layer.y + layer.height - height : layer.y,
    width,
    height,
  };
}

function canvasBlob(canvas: HTMLCanvasElement, mime: MergeMime, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('图片生成失败，请减小画布尺寸后重试。'));
        else if (blob.type !== mime) reject(new Error('当前浏览器不支持此导出格式，请使用 PNG。'));
        else resolve(blob);
      },
      mime,
      quality,
    );
  });
}

async function freezeImage(blob: Blob): Promise<ImageBitmap | HTMLCanvasElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // 部分浏览器需要先通过 Image 加载 SVG 等格式。
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    assertMergeSize(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法创建图片画布。');
    context.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createMergeAsset(file: File, pixelBudget: number): Promise<MergeAsset> {
  if (file.size > 50 * 1024 * 1024) throw new Error('单张图片不能超过 50 MB。');
  const dimensions = await readImageDimensions(file);
  assertMergeSize(dimensions.width, dimensions.height);
  if (dimensions.width * dimensions.height > pixelBudget) {
    throw new Error('图片总像素超过 3200 万，请减少图片或先缩小尺寸。');
  }
  const blob = await createImagePreviewBlob(file);
  const source = await freezeImage(blob);
  const disposeSource = () => {
    if (source instanceof HTMLCanvasElement) source.width = source.height = 0;
    else source.close();
  };
  const thumbnail = document.createElement('canvas');
  try {
    assertMergeSize(source.width, source.height);
    if (source.width * source.height > pixelBudget) {
      throw new Error('图片总像素超过 3200 万，请减少图片或先缩小尺寸。');
    }
    const ratio = Math.min(1, 1600 / Math.max(source.width, source.height));
    thumbnail.width = Math.max(1, Math.round(source.width * ratio));
    thumbnail.height = Math.max(1, Math.round(source.height * ratio));
    const context = thumbnail.getContext('2d');
    if (!context) throw new Error('当前浏览器无法创建预览画布。');
    context.drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
    const previewUrl = URL.createObjectURL(await canvasBlob(thumbnail, 'image/png'));
    return {
      id: crypto.randomUUID(),
      name: file.name,
      width: source.width,
      height: source.height,
      source,
      previewUrl,
      dispose: () => {
        URL.revokeObjectURL(previewUrl);
        disposeSource();
      },
    };
  } catch (error) {
    disposeSource();
    throw error;
  } finally {
    thumbnail.width = thumbnail.height = 0;
  }
}

export async function exportMergeDocument(
  value: MergeDocument,
  assets: ReadonlyMap<string, MergeAsset>,
  mime: MergeMime,
  quality: number,
): Promise<Blob> {
  assertMergeSize(value.width, value.height);
  const canvas = document.createElement('canvas');
  canvas.width = value.width;
  canvas.height = value.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法创建导出画布。');
    if (value.background !== 'transparent' || mime === 'image/jpeg') {
      context.fillStyle = value.background === 'transparent' ? '#ffffff' : value.background;
      context.fillRect(0, 0, value.width, value.height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    for (const layer of value.layers) {
      const asset = assets.get(layer.id);
      if (!asset) throw new Error('图片资源已失效，请重新导入。');
      context.drawImage(asset.source, layer.x, layer.y, layer.width, layer.height);
    }
    return await canvasBlob(canvas, mime, quality / 100);
  } finally {
    canvas.width = canvas.height = 0;
  }
}
