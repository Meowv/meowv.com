import JSZip from 'jszip';
import { detectImageMime } from '@/features/image/core/image';

const DECODABLE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('浏览器无法生成图片。'));
    }, type);
  });
}

async function renderSquarePng(file: File, size: number): Promise<Blob> {
  const mime = await detectImageMime(file);
  if (!mime || !DECODABLE_MIMES.has(mime)) {
    throw new Error('请选择 PNG、JPEG、WebP、GIF 或 BMP 图片。');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法创建 Canvas。');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, size, size);
    const scale = Math.min(size / bitmap.width, size / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    context.drawImage(
      bitmap,
      Math.round((size - width) / 2),
      Math.round((size - height) / 2),
      width,
      height,
    );
    return await canvasToBlob(canvas, 'image/png');
  } finally {
    bitmap.close();
  }
}

export async function createIco(file: File, size: number): Promise<Blob> {
  const png = new Uint8Array(await (await renderSquarePng(file, size)).arrayBuffer());
  const output = new Uint8Array(22 + png.length);
  const view = new DataView(output.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  output[6] = size === 256 ? 0 : size;
  output[7] = size === 256 ? 0 : size;
  output[8] = 0;
  output[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  output.set(png, 22);
  return new Blob([output], { type: 'image/vnd.microsoft.icon' });
}

export async function createFaviconPackage(file: File): Promise<Blob> {
  const zip = new JSZip();
  const entries = [
    ['favicon-16x16.png', 16],
    ['favicon-32x32.png', 32],
    ['apple-touch-icon.png', 180],
    ['android-chrome-192x192.png', 192],
    ['android-chrome-512x512.png', 512],
  ] as const;
  const rendered = await Promise.all(
    entries.map(async ([name, size]) => ({ name, blob: await renderSquarePng(file, size) })),
  );
  for (const entry of rendered) zip.file(entry.name, entry.blob);
  zip.file('favicon.ico', await createIco(file, 32));
  zip.file(
    'site.webmanifest',
    JSON.stringify(
      {
        name: '',
        short_name: '',
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
      },
      null,
      2,
    ),
  );
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
