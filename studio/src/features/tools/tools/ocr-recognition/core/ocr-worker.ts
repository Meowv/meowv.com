import Tesseract from 'tesseract.js';

export type OcrProgressCallback = (progress: number, status: string) => void;

let workerPromise: Promise<Tesseract.Worker> | null = null;
let progressCallback: OcrProgressCallback = () => undefined;
const staticRoot = import.meta.env.BASE_URL.replace(/\/$/, '');

function createOcrWorker(): Promise<Tesseract.Worker> {
  return Tesseract.createWorker(['chi_sim', 'eng'], Tesseract.OEM.LSTM_ONLY, {
    workerPath: `${staticRoot}/tesseract/worker.min.js`,
    corePath: `${staticRoot}/tesseract/tesseract-core-lstm.wasm.js`,
    langPath: `${staticRoot}/tesseract/lang`,
    logger: (message) => progressCallback(message.progress, message.status),
  });
}

export async function recognizeImage(
  image: Blob,
  onProgress: OcrProgressCallback,
): Promise<string> {
  progressCallback = onProgress;
  if (!workerPromise) workerPromise = createOcrWorker();
  try {
    const worker = await workerPromise;
    const { data } = await worker.recognize(image);
    return data.text.trim();
  } catch (error) {
    workerPromise = null;
    throw error;
  }
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
