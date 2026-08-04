/// <reference lib="webworker" />

interface EnhanceRequest {
  bitmap: ImageBitmap;
  enabled: boolean;
}

interface EnhanceResponse {
  blob: Blob;
}

self.onmessage = async (event: MessageEvent<EnhanceRequest>) => {
  const { bitmap, enabled } = event.data;
  try {
    const maxDimension = 2400;
    const scale = enabled
      ? Math.max(1, Math.min(2, maxDimension / Math.max(bitmap.width, bitmap.height)))
      : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('图片处理上下文不可用。');

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    if (enabled) {
      const imageData = context.getImageData(0, 0, width, height);
      const { data } = imageData;
      for (let index = 0; index < data.length; index += 4) {
        const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
        const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.32 + 128));
        data[index] = contrast;
        data[index + 1] = contrast;
        data[index + 2] = contrast;
      }
      context.putImageData(imageData, 0, 0);
    }

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ blob } satisfies EnhanceResponse);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '图片优化失败。' });
  } finally {
    bitmap.close();
  }
};
