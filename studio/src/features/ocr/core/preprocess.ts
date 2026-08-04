const enhanceWorker = new Worker(new URL('../workers/image-enhance.worker.ts', import.meta.url), {
  type: 'module',
});

interface EnhanceResponse {
  blob?: Blob;
  error?: string;
}

export async function preprocessImage(file: Blob, enabled: boolean): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return new Promise<Blob>((resolve, reject) => {
    const onMessage = (event: MessageEvent<EnhanceResponse>): void => {
      enhanceWorker.removeEventListener('message', onMessage);
      enhanceWorker.removeEventListener('error', onError);
      if (event.data.blob) resolve(event.data.blob);
      else reject(new Error(event.data.error ?? '图片优化失败。'));
    };
    const onError = (event: ErrorEvent): void => {
      enhanceWorker.removeEventListener('message', onMessage);
      enhanceWorker.removeEventListener('error', onError);
      reject(new Error(event.message || '图片优化 Worker 无法运行。'));
    };
    enhanceWorker.addEventListener('message', onMessage, { once: true });
    enhanceWorker.addEventListener('error', onError, { once: true });
    enhanceWorker.postMessage({ bitmap, enabled }, [bitmap]);
  });
}
