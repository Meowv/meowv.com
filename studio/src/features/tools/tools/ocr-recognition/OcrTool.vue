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
import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { formatBytes } from '@/features/tools/tools/_shared/image/format';
import {
  addOcrHistory,
  loadOcrHistory,
  removeOcrHistory,
} from '@/features/tools/tools/ocr-recognition/core/history';
import {
  extractPdfPageText,
  hasUsablePdfText,
  MAX_OCR_PDF_PAGES,
  parseOcrPageRange,
  renderPdfPageForOcr,
  renderPdfPreview,
} from '@/features/tools/tools/ocr-recognition/core/pdf';
import {
  recognizeImage,
  terminateOcrWorker,
} from '@/features/tools/tools/ocr-recognition/core/ocr-worker';
import {
  preprocessImage,
  terminateImageEnhanceWorker,
} from '@/features/tools/tools/ocr-recognition/core/preprocess';
import type {
  OcrHistoryEntry,
  OcrPdfInfo,
  OcrSourceInfo,
  OcrStage,
} from '@/features/tools/tools/ocr-recognition/types';
import { useFileHandoff } from '@/core/browser/file-handoff';
import { loadPdfFile } from '@/features/tools/tools/_shared/pdf/core/shared/file';
import { openPdfDocument } from '@/features/tools/tools/_shared/pdf/core/render/pdfjs';
import './ocr.css';

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
