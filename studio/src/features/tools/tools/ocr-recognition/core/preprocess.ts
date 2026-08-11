let enhanceWorker: Worker | null = null;
let workerGeneration = 0;

interface PendingJob {
  cleanup: () => void;
  reject: (reason: Error) => void;
}

let pendingJob: PendingJob | null = null;

interface EnhanceResponse {
  blob?: Blob;
  error?: string;
}

function getEnhanceWorker(): Worker {
  if (!enhanceWorker) {
    enhanceWorker = new Worker(new URL('../workers/image-enhance.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return enhanceWorker;
}

function createCancellationError(): DOMException {
  return new DOMException('OCR 图片优化已取消。', 'AbortError');
}

export async function preprocessImage(file: Blob, enabled: boolean): Promise<Blob> {
  const generation = workerGeneration;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  if (generation !== workerGeneration) {
    bitmap.close();
    throw createCancellationError();
  }

  if (pendingJob) {
    bitmap.close();
    throw new Error('OCR 图片优化任务仍在运行。');
  }

  const worker = getEnhanceWorker();
  return new Promise<Blob>((resolve, reject) => {
    const cleanup = (): void => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (pendingJob?.cleanup === cleanup) pendingJob = null;
    };
    const onMessage = (event: MessageEvent<EnhanceResponse>): void => {
      cleanup();
      if (event.data.blob) resolve(event.data.blob);
      else reject(new Error(event.data.error ?? '图片优化失败。'));
    };
    const onError = (event: ErrorEvent): void => {
      cleanup();
      reject(new Error(event.message || '图片优化 Worker 无法运行。'));
    };
    pendingJob = { cleanup, reject };
    worker.addEventListener('message', onMessage, { once: true });
    worker.addEventListener('error', onError, { once: true });
    try {
      worker.postMessage({ bitmap, enabled }, [bitmap]);
    } catch (error) {
      cleanup();
      bitmap.close();
      reject(error instanceof Error ? error : new Error('图片优化 Worker 无法运行。'));
    }
  });
}

export function terminateImageEnhanceWorker(): void {
  workerGeneration += 1;
  const job = pendingJob;
  job?.cleanup();
  job?.reject(createCancellationError());
  enhanceWorker?.terminate();
  enhanceWorker = null;
}
