/// <reference lib="webworker" />

import { initializeCanvas, readPsd } from 'ag-psd';

const DEFAULT_MEMORY_BUDGET = 512 * 1024 * 1024;
const COMPATIBILITY_MEMORY_BUDGET = 1024 * 1024 * 1024;

interface ParseRequest {
  type: 'parse';
  buffer: ArrayBuffer;
  compatibilityMode: boolean;
}

interface PsdMetadata {
  width: number;
  height: number;
  colorMode: string;
  channels: number;
  bitsPerChannel: number;
  layerCount: number;
  groupCount: number;
  hasTransparency: boolean;
  resolution: string | null;
  photoshopVersion: string | null;
}

const colorModes: Record<number, string> = {
  0: '位图',
  1: '灰度',
  2: '索引颜色',
  3: 'RGB',
  4: 'CMYK',
  7: '多通道',
  8: '双色调',
  9: 'Lab',
};

initializeCanvas(
  (width, height) => new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement,
);

function countLayers(children: unknown[] | undefined): { layers: number; groups: number } {
  if (!children?.length) return { layers: 0, groups: 0 };

  return children.reduce<{ layers: number; groups: number }>(
    (total, item) => {
      const nested = (item as { children?: unknown[] }).children;
      if (nested?.length) {
        const counted = countLayers(nested);
        total.groups += 1 + counted.groups;
        total.layers += counted.layers;
      } else {
        total.layers += 1;
      }
      return total;
    },
    { layers: 0, groups: 0 },
  );
}

function containsTransparency(canvas: OffscreenCanvas): boolean {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;

  const stripHeight = 64;
  for (let top = 0; top < canvas.height; top += stripHeight) {
    const height = Math.min(stripHeight, canvas.height - top);
    const { data } = context.getImageData(0, top, canvas.width, height);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 255) return true;
    }
  }
  return false;
}

function readMetadata(buffer: ArrayBuffer): { width: number; height: number } {
  if (buffer.byteLength < 26) throw new Error('PSD 文件头不完整。');
  const header = new DataView(buffer, 0, 26);
  if (header.getUint32(0, false) !== 0x38425053) throw new Error('不是有效的 PSD 文件。');
  if (header.getUint16(4, false) === 2) throw new Error('暂不支持 PSB 大型文档格式。');
  if (header.getUint16(4, false) !== 1) throw new Error('PSD 文件版本不受支持。');
  return { width: header.getUint32(18, false), height: header.getUint32(14, false) };
}

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { buffer, compatibilityMode } = event.data;
  try {
    readMetadata(buffer);
    const psd = readPsd(buffer, {
      skipLayerImageData: true,
      skipLinkedFilesData: true,
      skipThumbnail: true,
      totalMemoryLimit: compatibilityMode ? COMPATIBILITY_MEMORY_BUDGET : DEFAULT_MEMORY_BUDGET,
    });
    const canvas = psd.canvas as unknown as OffscreenCanvas | undefined;
    if (!canvas || !(canvas instanceof OffscreenCanvas)) {
      throw new Error('未能读取 PSD 合成图。');
    }

    const counts = countLayers(psd.children);
    const resolutionInfo = psd.imageResources?.resolutionInfo;
    const versionInfo = psd.imageResources?.versionInfo;
    const metadata: PsdMetadata = {
      width: psd.width,
      height: psd.height,
      colorMode: colorModes[psd.colorMode ?? 3] ?? '未知',
      channels: psd.channels ?? 0,
      bitsPerChannel: psd.bitsPerChannel ?? 0,
      layerCount: counts.layers,
      groupCount: counts.groups,
      hasTransparency: containsTransparency(canvas),
      resolution: resolutionInfo
        ? `${resolutionInfo.horizontalResolution} ${resolutionInfo.horizontalResolutionUnit} × ${resolutionInfo.verticalResolution} ${resolutionInfo.verticalResolutionUnit}`
        : null,
      photoshopVersion: versionInfo
        ? [versionInfo.writerName, versionInfo.readerName, `v${versionInfo.fileVersion}`]
            .filter(Boolean)
            .join(' · ')
        : null,
    };
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ type: 'success', metadata, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'PSD 解析失败。',
    });
  }
};
