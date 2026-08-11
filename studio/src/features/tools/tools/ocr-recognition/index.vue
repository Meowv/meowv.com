<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconDownload,
  IconFileText,
  IconHistory,
  IconPhotoScan,
  IconPlus,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-vue';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import Tesseract from 'tesseract.js';
import { formatBytes } from '@/features/tools/tools/_shared/image/format';
import { useFileHandoff } from '@/core/browser/file-handoff';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import { loadPdfFile } from '@/features/tools/tools/_shared/pdf/core/shared/file';
import { openPdfDocument } from '@/features/tools/tools/_shared/pdf/core/render/pdfjs';
import { parsePageRanges } from '@/features/tools/tools/_shared/pdf/core/shared/ranges';

interface OcrImageInfo {
  kind: 'image';
  file: File;
  url: string;
  width: number;
  height: number;
}

interface OcrPdfInfo {
  kind: 'pdf';
  file: File;
  bytes: Uint8Array;
  pageCount: number;
  currentPage: number;
  previewUrl: string;
}

type OcrSourceInfo = OcrImageInfo | OcrPdfInfo;

interface OcrHistoryEntry {
  id: string;
  fileName: string;
  text: string;
  createdAt: number;
}

type OcrStage = 'idle' | 'preparing' | 'loading' | 'recognizing' | 'complete' | 'error';

const HISTORY_KEY = `${STORAGE_POLICY.namespace('ocr')}:history`;
const MAX_HISTORY_ENTRIES = 20;

function readHistory(): OcrHistoryEntry[] {
  if (!storageAvailable()) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown;
    if (!Array.isArray(saved)) return [];
    return saved.filter(isHistoryEntry).slice(0, MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

function isHistoryEntry(value: unknown): value is OcrHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<OcrHistoryEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.fileName === 'string' &&
    typeof entry.text === 'string' &&
    typeof entry.createdAt === 'number'
  );
}

function writeHistory(entries: OcrHistoryEntry[]): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)));
  } catch {
    // 本地存储不可用不影响当前识别结果。
  }
}

function loadOcrHistory(): OcrHistoryEntry[] {
  return readHistory();
}

function addOcrHistory(fileName: string, text: string): OcrHistoryEntry {
  const entry: OcrHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName,
    text,
    createdAt: Date.now(),
  };
  writeHistory([entry, ...readHistory()]);
  return entry;
}

function removeOcrHistory(id: string): OcrHistoryEntry[] {
  const entries = readHistory().filter((entry) => entry.id !== id);
  writeHistory(entries);
  return entries;
}

type OcrProgressCallback = (progress: number, status: string) => void;

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

async function recognizeImage(image: Blob, onProgress: OcrProgressCallback): Promise<string> {
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

async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}

const MAX_OCR_PDF_PAGES = 20;

interface OcrPageRangeResult {
  pages: number[];
  error: string;
}

interface PdfTextItem {
  str?: unknown;
  hasEOL?: unknown;
}

function isPdfTextItem(value: unknown): value is PdfTextItem {
  return typeof value === 'object' && value !== null && 'str' in value;
}

function parseOcrPageRange(input: string, pageCount: number): OcrPageRangeResult {
  const parsed = parsePageRanges(input, pageCount);
  if (!parsed.valid) return { pages: [], error: parsed.error };

  const pages: number[] = [];
  const seen = new Set<number>();
  for (const group of parsed.groups) {
    for (const page of group.pages) {
      if (seen.has(page)) {
        return { pages: [], error: `页码 ${page} 重复，请每页只选择一次。` };
      }
      seen.add(page);
      pages.push(page);
    }
  }

  if (pages.length > MAX_OCR_PDF_PAGES) {
    return { pages: [], error: `单次最多识别 ${MAX_OCR_PDF_PAGES} 页。` };
  }

  return { pages, error: '' };
}

async function extractPdfPageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  let text = '';

  for (const item of content.items) {
    if (!isPdfTextItem(item) || typeof item.str !== 'string') continue;
    text += item.str;
    text += item.hasEOL ? '\n' : ' ';
  }

  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasUsablePdfText(text: string): boolean {
  return Boolean(text.replace(/\s/g, ''));
}

async function renderPdfPageForOcr(page: PDFPageProxy): Promise<Blob> {
  const baseViewport = page.getViewport({ scale: 1 });
  const maxDimension = 3_000;
  const scale = Math.min(2, maxDimension / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale: Math.max(scale, 0.5) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  try {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法创建页面画布。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('浏览器无法生成页面图片。'));
      }, 'image/png');
    });
    return blob;
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

async function renderPdfPreview(document: PDFDocumentProxy, pageNumber: number): Promise<Blob> {
  const page = await document.getPage(pageNumber);
  try {
    return await renderPdfPageForOcr(page);
  } finally {
    page.cleanup();
  }
}

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

const IMAGE_ENHANCE_WORKER_SOURCE = `
self.onmessage = async (event) => {
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
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '图片优化失败。' });
  } finally {
    bitmap.close();
  }
};
`;
let enhanceWorkerUrl = '';

function getEnhanceWorker(): Worker {
  if (!enhanceWorker) {
    enhanceWorkerUrl = URL.createObjectURL(
      new Blob([IMAGE_ENHANCE_WORKER_SOURCE], { type: 'text/javascript' }),
    );
    enhanceWorker = new Worker(enhanceWorkerUrl, { type: 'module' });
  }
  return enhanceWorker;
}

function createCancellationError(): DOMException {
  return new DOMException('OCR 图片优化已取消。', 'AbortError');
}

async function preprocessImage(file: Blob, enabled: boolean): Promise<Blob> {
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

function terminateImageEnhanceWorker(): void {
  workerGeneration += 1;
  const job = pendingJob;
  job?.cleanup();
  job?.reject(createCancellationError());
  enhanceWorker?.terminate();
  enhanceWorker = null;
  if (enhanceWorkerUrl) URL.revokeObjectURL(enhanceWorkerUrl);
  enhanceWorkerUrl = '';
}

const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PDF_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp']);

interface OcrPdfPageResult {
  pageNumber: number;
  text: string;
}

const source = ref<OcrSourceInfo | null>(null);
const optimizeImage = ref(true);
const pageRange = ref('1');
const previewLoading = ref(false);
const stage = ref<OcrStage>('idle');
const progress = ref(0);
const progressLabel = ref('');
const resultText = ref('');
const pdfPageResults = ref<OcrPdfPageResult[]>([]);
const resultWasEdited = ref(false);
const elapsedMs = ref<number | null>(null);
const errorMessage = ref('');
const noticeMessage = ref('');
const copied = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const history = ref<OcrHistoryEntry[]>(loadOcrHistory());
let copyTimer: number | undefined;

const isBusy = computed(
  () => stage.value === 'preparing' || stage.value === 'loading' || stage.value === 'recognizing',
);
const hasResult = computed(() => stage.value === 'complete');
const isPdf = computed(() => source.value?.kind === 'pdf');
const pdfRange = computed(() => {
  if (source.value?.kind !== 'pdf') return { pages: [], error: '' };
  return parseOcrPageRange(pageRange.value, source.value.pageCount);
});
const statusLabel = computed(() => {
  if (stage.value === 'preparing') return '正在准备识别';
  if (stage.value === 'loading') return '正在加载识别模型';
  if (stage.value === 'recognizing') return '正在识别文字';
  if (stage.value === 'complete') return '识别完成';
  if (stage.value === 'error') return '识别失败';
  return '';
});

function isSupportedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.has(file.type) || /\.(jpe?g|png|webp|bmp)$/i.test(file.name);
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function revokeSourceUrl(value: OcrSourceInfo | null): void {
  if (!value) return;
  if (value.kind === 'image') URL.revokeObjectURL(value.url);
  else if (value.previewUrl) URL.revokeObjectURL(value.previewUrl);
}

function resetResult(): void {
  resultText.value = '';
  pdfPageResults.value = [];
  resultWasEdited.value = false;
  elapsedMs.value = null;
  progress.value = 0;
  progressLabel.value = '';
  stage.value = 'idle';
  noticeMessage.value = '';
}

async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

async function setImage(file: File): Promise<void> {
  errorMessage.value = '';
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    errorMessage.value = '图片超过 10 MB。请先使用图片压缩工具减小文件体积后再识别。';
    return;
  }
  if (!isSupportedImage(file)) {
    errorMessage.value = '请选择 JPG、PNG、WebP、BMP 图片或 PDF 文件。';
    return;
  }

  try {
    const dimensions = await readDimensions(file);
    revokeSourceUrl(source.value);
    source.value = { kind: 'image', file, url: URL.createObjectURL(file), ...dimensions };
    resetResult();
  } catch {
    errorMessage.value = '无法读取这张图片。请确认文件未损坏且当前浏览器支持其格式。';
  }
}

async function setPdf(file: File): Promise<void> {
  errorMessage.value = '';
  if (file.size > MAX_PDF_FILE_SIZE) {
    errorMessage.value = 'PDF 超过 50 MB，当前 OCR 最多处理 50 MB 的单个 PDF。';
    return;
  }
  if (!isPdfFile(file)) {
    errorMessage.value = '请选择扩展名为 .pdf 的文件。';
    return;
  }

  try {
    const loaded = await loadPdfFile(file);
    const pdf: OcrPdfInfo = {
      kind: 'pdf',
      file,
      bytes: loaded.bytes,
      pageCount: loaded.pageCount,
      currentPage: 1,
      previewUrl: '',
    };
    revokeSourceUrl(source.value);
    source.value = pdf;
    pageRange.value = '1';
    resetResult();
    const selectedPdf = source.value;
    if (selectedPdf?.kind === 'pdf') await updatePdfPreview(selectedPdf, 1);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    errorMessage.value = detail && detail !== '[object Object]' ? detail : '无法读取这个 PDF。';
  }
}

async function setSource(file: File): Promise<void> {
  if (isPdfFile(file)) await setPdf(file);
  else await setImage(file);
}

async function updatePdfPreview(pdf: OcrPdfInfo, pageNumber: number): Promise<void> {
  previewLoading.value = true;
  let previewUrl = '';
  try {
    const document = await openPdfDocument(pdf.bytes);
    try {
      previewUrl = URL.createObjectURL(await renderPdfPreview(document, pageNumber));
    } finally {
      await document.destroyDocument();
    }

    if (source.value !== pdf) {
      URL.revokeObjectURL(previewUrl);
      return;
    }
    if (pdf.previewUrl) URL.revokeObjectURL(pdf.previewUrl);
    pdf.previewUrl = previewUrl;
    pdf.currentPage = pageNumber;
  } catch (error) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const detail = error instanceof Error ? error.message : String(error);
    errorMessage.value = detail || `第 ${pageNumber} 页预览失败。`;
  } finally {
    if (source.value === pdf) previewLoading.value = false;
  }
}

function selectSource(): void {
  if (isBusy.value) return;
  fileInput.value?.click();
}

function onInput(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void setSource(file);
  if (fileInput.value) fileInput.value.value = '';
}

function onDrop(event: DragEvent): void {
  const file = event.dataTransfer?.files[0];
  if (file && !isBusy.value) void setSource(file);
}

function onPaste(event: ClipboardEvent): void {
  if (isBusy.value) return;
  const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
    item.type.startsWith('image/'),
  );
  if (file) {
    event.preventDefault();
    void setImage(file);
  }
}

function updateProgress(value: number, status: string): void {
  progress.value = Math.round(value * 100);
  progressLabel.value = status;
  stage.value = /recogniz/i.test(status) ? 'recognizing' : 'loading';
}

function updatePdfProgress(pageIndex: number, total: number, pageNumber: number) {
  return (value: number, status: string): void => {
    progress.value = Math.round(((pageIndex + value) / total) * 100);
    progressLabel.value = `第 ${pageNumber} 页：${status}`;
    stage.value = /recogniz/i.test(status) ? 'recognizing' : 'loading';
  };
}

function plainPdfText(results: OcrPdfPageResult[]): string {
  return results.map(({ pageNumber, text }) => `第 ${pageNumber} 页\n${text}`).join('\n\n');
}

function markdownPdfText(results: OcrPdfPageResult[]): string {
  return results.map(({ pageNumber, text }) => `## 第 ${pageNumber} 页\n\n${text}`).join('\n\n');
}

async function recognizePdf(pdf: OcrPdfInfo, pages: number[]): Promise<OcrPdfPageResult[]> {
  const document = await openPdfDocument(pdf.bytes);
  const results: OcrPdfPageResult[] = [];
  const failedPages: number[] = [];

  try {
    for (const [index, pageNumber] of pages.entries()) {
      let page: PDFPageProxy | null = null;
      try {
        stage.value = 'preparing';
        progress.value = Math.round((index / pages.length) * 100);
        progressLabel.value = `第 ${pageNumber} 页：正在读取文字`;
        page = await document.getPage(pageNumber);
        const nativeText = await extractPdfPageText(page);
        let text = nativeText;

        if (!hasUsablePdfText(nativeText)) {
          progressLabel.value = `第 ${pageNumber} 页：正在渲染页面`;
          const renderedPage = await renderPdfPageForOcr(page);
          const preparedImage = await preprocessImage(renderedPage, optimizeImage.value);
          text = await recognizeImage(
            preparedImage,
            updatePdfProgress(index, pages.length, pageNumber),
          );
        }

        results.push({ pageNumber, text });
      } catch {
        failedPages.push(pageNumber);
      } finally {
        page?.cleanup();
      }
    }
  } finally {
    await document.destroyDocument();
  }

  if (!results.length) {
    throw new Error('所选页面均未能识别，请确认 PDF 未损坏后重试。');
  }
  if (failedPages.length) {
    noticeMessage.value = `已完成其余页面，以下页面识别失败：${failedPages.join('、')}。`;
  }
  return results;
}

async function startRecognition(): Promise<void> {
  if (!source.value || isBusy.value || previewLoading.value) return;
  const selectedSource = source.value;
  const selectedPages = selectedSource.kind === 'pdf' ? pdfRange.value.pages : [];
  if (selectedSource.kind === 'pdf' && pdfRange.value.error) {
    errorMessage.value = pdfRange.value.error;
    return;
  }

  const startedAt = performance.now();
  errorMessage.value = '';
  noticeMessage.value = '';
  progress.value = 0;
  progressLabel.value = '';
  stage.value = 'preparing';
  try {
    if (selectedSource.kind === 'image') {
      const preparedImage = await preprocessImage(selectedSource.file, optimizeImage.value);
      stage.value = 'loading';
      resultText.value = await recognizeImage(preparedImage, updateProgress);
    } else {
      pdfPageResults.value = await recognizePdf(selectedSource, selectedPages);
      resultText.value = plainPdfText(pdfPageResults.value);
    }
    resultWasEdited.value = false;
    elapsedMs.value = Math.round(performance.now() - startedAt);
    stage.value = 'complete';
    history.value = [
      addOcrHistory(selectedSource.file.name, resultText.value),
      ...history.value,
    ].slice(0, 20);
  } catch (error) {
    stage.value = 'error';
    const detail = error instanceof Error ? error.message : String(error);
    errorMessage.value =
      detail && detail !== '[object Object]' ? `识别失败：${detail}` : '识别失败，请稍后重试。';
  }
}

async function copyText(): Promise<void> {
  if (!resultText.value) return;
  try {
    await navigator.clipboard.writeText(resultText.value);
    copied.value = true;
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => (copied.value = false), 1800);
  } catch {
    errorMessage.value = '无法访问剪贴板，请手动选择并复制文本。';
  }
}

function downloadText(extension: 'txt' | 'md'): void {
  if (!resultText.value) return;
  const name = source.value?.file.name.replace(/\.[^.]+$/, '') || 'ocr-result';
  const canFormatPdf =
    source.value?.kind === 'pdf' && !resultWasEdited.value && pdfPageResults.value.length;
  const content = canFormatPdf
    ? extension === 'md'
      ? markdownPdfText(pdfPageResults.value)
      : plainPdfText(pdfPageResults.value)
    : extension === 'md'
      ? `# ${name}\n\n${resultText.value}\n`
      : resultText.value;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
}

function openHistory(entry: OcrHistoryEntry): void {
  resultText.value = entry.text;
  pdfPageResults.value = [];
  resultWasEdited.value = true;
  elapsedMs.value = null;
  stage.value = 'complete';
  noticeMessage.value = '';
}

function deleteHistory(id: string): void {
  history.value = removeOcrHistory(id);
}

function clearSource(): void {
  revokeSourceUrl(source.value);
  source.value = null;
  errorMessage.value = '';
  resetResult();
}

onMounted(() => {
  window.addEventListener('paste', onPaste);
  const handoff = useFileHandoff().take('image');
  if (handoff) void setImage(handoff);
});

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste);
  window.clearTimeout(copyTimer);
  revokeSourceUrl(source.value);
  terminateImageEnhanceWorker();
  void terminateOcrWorker().catch(() => undefined);
});
</script>

<template>
  <section class="ocr-page" aria-label="OCR 文字识别">
    <div class="ocr-page__content">
      <p v-if="errorMessage" class="ocr-alert" role="alert">
        {{ errorMessage }}
        <RouterLink v-if="errorMessage.includes('10 MB')" to="/tools/image-compress"
          >前往图片压缩</RouterLink
        >
      </p>
      <p v-if="noticeMessage" class="ocr-notice" role="status">{{ noticeMessage }}</p>

      <div class="ocr-workspace">
        <section class="ocr-panel ocr-panel--image" aria-label="文件预览">
          <template v-if="source">
            <div class="ocr-preview" :class="{ 'ocr-preview--loading': previewLoading }">
              <img
                v-if="source.kind === 'image' || source.previewUrl"
                :src="source.kind === 'image' ? source.url : source.previewUrl"
                :alt="source.file.name"
              />
              <span v-else>正在生成预览</span>
            </div>

            <div v-if="source.kind === 'pdf'" class="ocr-pdf-pages">
              <button
                class="ocr-icon-button"
                type="button"
                title="上一页"
                aria-label="上一页"
                :disabled="isBusy || previewLoading || source.currentPage === 1"
                @click="updatePdfPreview(source, source.currentPage - 1)"
              >
                <IconChevronLeft :size="18" />
              </button>
              <span>第 {{ source.currentPage }} / {{ source.pageCount }} 页</span>
              <button
                class="ocr-icon-button"
                type="button"
                title="下一页"
                aria-label="下一页"
                :disabled="isBusy || previewLoading || source.currentPage === source.pageCount"
                @click="updatePdfPreview(source, source.currentPage + 1)"
              >
                <IconChevronRight :size="18" />
              </button>
            </div>

            <div class="ocr-file-meta">
              <div>
                <strong>{{ source.file.name }}</strong>
                <span v-if="source.kind === 'image'"
                  >{{ formatBytes(source.file.size) }} · {{ source.width }} ×
                  {{ source.height }} px</span
                >
                <span v-else>{{ formatBytes(source.file.size) }} · {{ source.pageCount }} 页</span>
              </div>
              <button
                class="ocr-icon-button"
                type="button"
                title="移除文件"
                aria-label="移除文件"
                :disabled="isBusy"
                @click="clearSource"
              >
                <IconX :size="19" />
              </button>
            </div>

            <label v-if="source.kind === 'pdf'" class="ocr-page-range">
              <span>识别页码</span>
              <input
                v-model="pageRange"
                type="text"
                inputmode="text"
                :disabled="isBusy"
                placeholder="例如 1,3-5"
              />
              <small :class="{ 'ocr-page-range__error': pdfRange.error }">
                {{
                  pdfRange.error || `已选 ${pdfRange.pages.length} 页，最多 ${MAX_OCR_PDF_PAGES} 页`
                }}
              </small>
            </label>

            <label class="ocr-switch"
              ><input v-model="optimizeImage" type="checkbox" :disabled="isBusy" /><span></span
              ><span
                ><strong>自动优化</strong><small>仅在图片和扫描页 OCR 时使用</small></span
              ></label
            >
            <button
              class="ocr-primary-button"
              type="button"
              :disabled="isBusy || previewLoading || (isPdf && Boolean(pdfRange.error))"
              @click="startRecognition"
            >
              <IconPhotoScan :size="19" />{{ isBusy ? statusLabel : '开始识别' }}
            </button>
            <button
              class="ocr-secondary-button"
              type="button"
              :disabled="isBusy"
              @click="selectSource"
            >
              <IconPlus :size="18" />更换文件
            </button>
          </template>
          <button
            v-else
            class="ocr-dropzone"
            type="button"
            @click="selectSource"
            @dragover.prevent
            @drop.prevent="onDrop"
          >
            <span class="ocr-dropzone__icon"><IconUpload :size="28" /></span>
            <strong>拖入图片或 PDF，或点击选择本地文件</strong>
            <span>图片支持 JPG、PNG、WebP、BMP，最大 10 MB</span>
            <span>PDF 最大 50 MB，单次最多识别 20 页</span>
          </button>
          <input
            ref="fileInput"
            class="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp,application/pdf,.pdf"
            @change="onInput"
          />
        </section>

        <section class="ocr-panel ocr-panel--result" aria-live="polite" aria-label="OCR 结果">
          <header v-if="stage !== 'idle'" class="ocr-result-header">
            <div>
              <span class="ocr-status" :class="`ocr-status--${stage}`"
                ><IconCheck v-if="hasResult" :size="15" /><IconClock v-else :size="15" />{{
                  statusLabel
                }}</span
              ><small v-if="elapsedMs !== null">耗时 {{ (elapsedMs / 1000).toFixed(1) }} 秒</small>
            </div>
            <div v-if="hasResult" class="ocr-result-actions">
              <button
                class="ocr-icon-button"
                type="button"
                title="复制文本"
                aria-label="复制文本"
                @click="copyText"
              >
                <IconCheck v-if="copied" :size="18" /><IconCopy v-else :size="18" />
              </button>
              <button
                class="ocr-icon-button"
                type="button"
                title="下载 TXT"
                aria-label="下载 TXT"
                @click="downloadText('txt')"
              >
                <IconDownload :size="18" />
              </button>
              <button
                class="ocr-icon-button"
                type="button"
                title="下载 Markdown"
                aria-label="下载 Markdown"
                @click="downloadText('md')"
              >
                <IconFileText :size="18" />
              </button>
            </div>
          </header>
          <div v-if="isBusy" class="ocr-progress">
            <div>
              <span>{{ progressLabel || statusLabel }}</span
              ><strong>{{ progress }}%</strong>
            </div>
            <i><b :style="{ width: `${progress}%` }"></b></i>
          </div>
          <textarea
            v-if="hasResult"
            v-model="resultText"
            class="ocr-result-text"
            aria-label="OCR 识别文本"
            spellcheck="false"
            @input="resultWasEdited = true"
          />
          <div v-else class="ocr-result-empty">
            <span class="ocr-result-empty__icon"><IconPhotoScan :size="28" /></span
            ><strong>{{ source ? '识别结果将在这里显示' : '识别图片或PDF中的文字' }}</strong>
          </div>
        </section>
      </div>

      <section v-if="history.length" class="ocr-history" aria-labelledby="ocr-history-title">
        <header>
          <div>
            <IconHistory :size="19" />
            <h2 id="ocr-history-title">历史记录</h2>
          </div>
        </header>
        <ul>
          <li v-for="entry in history" :key="entry.id">
            <button type="button" @click="openHistory(entry)">
              <strong>{{ entry.fileName }}</strong
              ><span>{{ new Date(entry.createdAt).toLocaleString('zh-CN') }}</span
              ><small>{{ entry.text || '未识别到文字' }}</small>
            </button>
            <button
              class="ocr-icon-button"
              type="button"
              title="删除历史记录"
              aria-label="删除历史记录"
              @click="deleteHistory(entry.id)"
            >
              <IconTrash :size="17" />
            </button>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style>
.ocr-page {
  --ocr-primary: var(--menu-ocr);
  --ocr-primary-soft: #e2f3ef;
  --ocr-primary-border: #a7dbd1;
  --ocr-warning: #b45309;
  min-height: 0;
  color: var(--color-text);
}
:root[data-theme='dark'] .ocr-page {
  --ocr-primary: var(--menu-ocr-foreground);
  --ocr-primary-soft: #123b39;
  --ocr-primary-border: #256d65;
  --ocr-warning: #fbbf24;
}
.ocr-page__content {
  width: 100%;
  margin: 0 auto;
}
.ocr-dropzone__icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--ocr-primary-border);
  border-radius: 8px;
  background: var(--ocr-primary-soft);
  color: var(--ocr-primary);
}
.ocr-page__content {
  padding: 0;
}
.ocr-alert {
  display: flex;
  margin: 0 0 20px;
  padding: 11px 14px;
  border: 1px solid var(--ocr-primary-border);
  border-radius: 7px;
  background: var(--ocr-primary-soft);
  color: var(--ocr-primary);
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 650;
}
.ocr-alert {
  border-color: color-mix(in srgb, var(--color-danger) 42%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface-solid));
  color: var(--color-danger);
}
.ocr-alert a {
  text-decoration: underline;
}
.ocr-notice {
  margin: 0 0 20px;
  padding: 11px 14px;
  border: 1px solid color-mix(in srgb, var(--ocr-warning) 42%, var(--color-border));
  border-radius: 7px;
  background: color-mix(in srgb, var(--ocr-warning) 10%, var(--color-surface-solid));
  color: var(--ocr-warning);
  font-size: 13px;
  font-weight: 650;
}
.ocr-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface-solid);
}
.ocr-panel {
  min-width: 0;
  padding: 24px;
}
.ocr-panel--image {
  display: flex;
  padding: 8px;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface-soft);
  flex-direction: column;
  gap: 14px;
}
.ocr-preview {
  display: grid;
  min-height: 300px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: repeating-conic-gradient(#e7ece8 0 25%, #f7f9f7 0 50%) 50% / 20px 20px;
  place-items: center;
}
:root[data-theme='dark'] .ocr-preview {
  background: repeating-conic-gradient(#202832 0 25%, #171d25 0 50%) 50% / 20px 20px;
}
.ocr-preview img {
  display: block;
  max-width: 100%;
  max-height: 470px;
  object-fit: contain;
}
.ocr-preview--loading {
  color: var(--color-text-muted);
  font-size: 13px;
}
.ocr-pdf-pages {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
}
.ocr-pdf-pages > span {
  min-width: 96px;
  color: var(--color-text-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.ocr-file-meta,
.ocr-result-header {
  display: flex;
  min-width: 0;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.ocr-file-meta > div {
  min-width: 0;
}
.ocr-file-meta strong,
.ocr-file-meta span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ocr-file-meta strong {
  font-size: 14px;
}
.ocr-file-meta span,
.ocr-result-header small {
  color: var(--color-text-muted);
  font-size: 12px;
}
.ocr-page-range {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px 10px;
  font-size: 13px;
  font-weight: 650;
}
.ocr-page-range input {
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: 0;
  background: var(--color-surface-solid);
  color: var(--color-text);
  font: inherit;
  font-weight: 400;
}
.ocr-page-range input:focus {
  border-color: var(--ocr-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ocr-primary) 16%, transparent);
}
.ocr-page-range small {
  grid-column: 2;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 400;
}
.ocr-page-range__error {
  color: var(--color-danger) !important;
}
.ocr-icon-button {
  display: inline-grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-solid);
  color: var(--color-text-muted);
  cursor: pointer;
  place-items: center;
}
.ocr-icon-button:hover:not(:disabled) {
  border-color: var(--ocr-primary-border);
  color: var(--ocr-primary);
}
.ocr-icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.ocr-switch {
  display: flex;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface-solid);
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.ocr-switch input {
  position: absolute;
  opacity: 0;
}
.ocr-switch > span:nth-child(2) {
  position: relative;
  width: 36px;
  height: 20px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--color-border-strong);
  transition: background 160ms ease;
}
.ocr-switch > span:nth-child(2)::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  content: '';
  transition: transform 160ms ease;
}
.ocr-switch input:checked + span {
  background: var(--ocr-primary);
}
.ocr-switch input:checked + span::after {
  transform: translateX(16px);
}
.ocr-switch strong,
.ocr-switch small {
  display: block;
}
.ocr-switch strong {
  font-size: 13px;
}
.ocr-switch small {
  color: var(--color-text-muted);
  font-size: 12px;
}
.ocr-primary-button,
.ocr-secondary-button {
  display: inline-flex;
  min-height: 44px;
  justify-content: center;
  align-items: center;
  gap: 8px;
  border-radius: 7px;
  font-weight: 700;
  cursor: pointer;
}
.ocr-primary-button {
  margin-top: auto;
  border: 1px solid var(--ocr-primary);
  background: var(--ocr-primary);
  color: #fff;
}
.ocr-secondary-button {
  border: 1px solid var(--color-border);
  background: var(--color-surface-solid);
  color: var(--color-text);
}
.ocr-primary-button:disabled,
.ocr-secondary-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.ocr-dropzone {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 380px;
  padding: 36px;
  border: 1px dashed var(--ocr-primary-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--ocr-primary-soft) 45%, var(--color-surface-solid));
  color: var(--color-text);
  align-items: center;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
}
.ocr-dropzone:hover {
  border-color: var(--ocr-primary);
}
.ocr-dropzone__icon {
  width: 54px;
  height: 54px;
  margin-bottom: 8px;
}
.ocr-dropzone strong {
  font-size: 16px;
}
.ocr-dropzone > span,
.ocr-dropzone small {
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
}
.ocr-panel--result {
  display: flex;
  min-height: 0;
  background: var(--color-bg);
  flex-direction: column;
  gap: 18px;
}
.ocr-status {
  display: inline-flex;
  color: var(--color-text-muted);
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
}
.ocr-status--complete {
  color: var(--ocr-primary);
}
.ocr-status--error {
  color: var(--color-danger);
}
.ocr-result-header > div:first-child {
  display: grid;
  gap: 3px;
}
.ocr-result-actions {
  display: flex;
  gap: 6px;
}
.ocr-progress {
  display: grid;
  gap: 7px;
}
.ocr-progress > div {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-muted);
  font-size: 12px;
}
.ocr-progress i {
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-border);
}
.ocr-progress b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ocr-primary);
  transition: width 180ms ease;
}
.ocr-result-text {
  width: 100%;
  min-height: 0;
  flex: 1;
  padding: 16px;
  resize: vertical;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  outline: 0;
  background: var(--color-surface-solid);
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  line-height: 1.8;
}
.ocr-result-text:focus {
  border-color: var(--ocr-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ocr-primary) 16%, transparent);
}
.ocr-result-empty {
  display: flex;
  flex: 1;
  min-height: 380px;
  padding: 36px;
  color: var(--color-text-muted);
  text-align: center;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.ocr-result-empty__icon {
  display: grid;
  width: 54px;
  height: 54px;
  margin-bottom: 8px;
  border: 1px solid var(--ocr-primary-border);
  border-radius: 8px;
  background: var(--ocr-primary-soft);
  color: var(--ocr-primary);
  place-items: center;
}
.ocr-result-empty strong {
  color: var(--color-text);
  font-size: 16px;
}
.ocr-result-empty::after {
  display: block;
  height: 48px;
  flex: 0 0 auto;
  content: '';
}
.ocr-history {
  margin-top: 32px;
}
.ocr-history header {
  display: flex;
  padding: 0 0 12px;
  align-items: center;
}
.ocr-history header > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ocr-history h2 {
  margin: 0;
  font-size: 16px;
}
.ocr-history ul {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  overflow: hidden;
}
.ocr-history li {
  display: flex;
  min-width: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  gap: 12px;
  transition: background 160ms ease;
}
.ocr-history li:last-child {
  border-bottom: 0;
}
.ocr-history li:hover,
.ocr-history li:focus-within {
  background: var(--ocr-primary-soft);
}
.ocr-history li > button:first-child {
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}
.ocr-history strong,
.ocr-history span,
.ocr-history small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ocr-history strong {
  font-size: 13px;
}
.ocr-history li:hover strong,
.ocr-history li:focus-within strong {
  color: var(--ocr-primary);
}
.ocr-history span,
.ocr-history small {
  color: var(--color-text-muted);
  font-size: 12px;
}
.ocr-history small {
  margin-top: 2px;
}
@media (max-width: 820px) {
  .ocr-workspace {
    grid-template-columns: 1fr;
  }
  .ocr-panel--image {
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }
  .ocr-preview {
    min-height: 260px;
  }
  .ocr-dropzone {
    min-height: 300px;
  }
  .ocr-result-text,
  .ocr-result-empty {
    min-height: 300px;
  }
}
@media (max-width: 560px) {
  .ocr-page__content {
    width: min(100% - 32px, 1240px);
  }
  .ocr-panel {
    padding: 14px;
  }
  .ocr-history header {
    padding-bottom: 10px;
  }
}
</style>
