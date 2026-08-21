<script setup lang="ts">
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBrandAdobePhotoshop,
  IconCheck,
  IconChevronDown,
  IconClipboard,
  IconDownload,
  IconRefresh,
  IconUpload,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ImageToolHeader from '@/features/tools/tools/_shared/image/components/layout/ImageToolHeader.vue';
import ImageDropzone from '@/features/tools/tools/_shared/image/components/upload/ImageDropzone.vue';
import { useImagePaste } from '@/features/tools/tools/_shared/image/composables/useImagePaste';
import { receiveWindowFileHandoff, useFileHandoff } from '@/core/browser/file-handoff';
import { downloadBlob } from '@/core/browser/download';
import { formatBytes } from '@/features/tools/tools/_shared/image/format';

type BackgroundMode = 'checkerboard' | 'white' | 'black';
type ExportMime = 'image/png' | 'image/jpeg' | 'image/webp';
type ViewerStatus = 'idle' | 'compatibility' | 'reading' | 'ready' | 'error';

interface PsdHeader {
  width: number;
  height: number;
  channels: number;
  bitsPerChannel: number;
  colorMode: number;
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

defineProps<{ embedded?: boolean }>();

const DEFAULT_MAX_FILE_SIZE = 200 * 1024 * 1024;
const DEFAULT_MAX_PIXELS = 60_000_000;
const DEFAULT_MEMORY_BUDGET = 512 * 1024 * 1024;
const COMPATIBILITY_MAX_FILE_SIZE = 350 * 1024 * 1024;
const COMPATIBILITY_MAX_PIXELS = 100_000_000;
const COMPATIBILITY_MEMORY_BUDGET = 1024 * 1024 * 1024;
const MAX_EXPORT_PIXELS = 120_000_000;

const fileInput = ref<HTMLInputElement | null>(null);
const viewerElement = ref<HTMLElement | null>(null);
const viewportElement = ref<HTMLElement | null>(null);
const canvasElement = ref<HTMLCanvasElement | null>(null);
const selectedFile = ref<File | null>(null);
const metadata = ref<PsdMetadata | null>(null);
const status = ref<ViewerStatus>('idle');
const message = ref('');
const progress = ref(0);
const compatibilityReason = ref('');
const compatibilityHeader = ref<PsdHeader | null>(null);
const background = ref<BackgroundMode>('checkerboard');
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const pointer = ref({ x: 0, y: 0, color: '' });
const isDragging = ref(false);
const isFullscreen = ref(false);
const exportMime = ref<ExportMime>('image/png');
const exportQuality = ref(90);
const exportScale = ref(100);
const keepTransparency = ref(true);
const isExporting = ref(false);
const copied = ref(false);

let parserWorker: Worker | null = null;
let resizeObserver: ResizeObserver | null = null;
let dragStart: { x: number; y: number; panX: number; panY: number } | null = null;
let copiedTimer: number | undefined;
let stopWindowFileHandoff: () => void = () => undefined;

const hasPreview = computed(() => status.value === 'ready' && metadata.value !== null);
const qualityEnabled = computed(() => exportMime.value !== 'image/png');
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);
const selectedBackgroundLabel = computed(
  () => ({ checkerboard: '透明', white: '白色', black: '黑色' })[background.value],
);
const exportPixels = computed(() => {
  const source = metadata.value;
  if (!source) return 0;
  const scale = exportScale.value / 100;
  return Math.round(source.width * scale) * Math.round(source.height * scale);
});
const exportBlocked = computed(() => exportPixels.value > MAX_EXPORT_PIXELS);

useImagePaste((files) => acceptFile(files[0]!), {
  disabled: () => status.value === 'reading' || isExporting.value,
  multiple: false,
  filter: isPsdFile,
});
const infoRows = computed(() => {
  const file = selectedFile.value;
  const info = metadata.value;
  if (!file || !info) return [];
  const ratio = info.height ? (info.width / info.height).toFixed(3) : '—';
  return [
    ['文件名称与大小', `${file.name} · ${formatBytes(file.size)}`],
    ['画布宽高', `${info.width} × ${info.height} px`],
    ['宽高比例', ratio],
    ['色彩模式', info.colorMode],
    ['通道数', String(info.channels || '—')],
    ['位深度', info.bitsPerChannel ? `${info.bitsPerChannel} 位/通道` : '—'],
    ['图层数量', String(info.layerCount)],
    ['图层组数量', String(info.groupCount)],
    ['包含透明区域', info.hasTransparency ? '是' : '否'],
    ['分辨率', info.resolution ?? '文件未包含'],
    ['Photoshop 创建版本', info.photoshopVersion ?? '文件未包含'],
  ];
});

watch(exportMime, (mime) => {
  if (mime === 'image/jpeg') keepTransparency.value = false;
});

function isPsdFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.psd') || file.type === 'image/vnd.adobe.photoshop';
}

function setError(messageText: string): void {
  stopParsing();
  status.value = 'error';
  message.value = messageText;
  progress.value = 0;
}

function stopParsing(): void {
  parserWorker?.terminate();
  parserWorker = null;
}

function resetPreview(): void {
  stopParsing();
  metadata.value = null;
  progress.value = 0;
  message.value = '';
  pointer.value = { x: 0, y: 0, color: '' };
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
  const canvas = canvasElement.value;
  if (canvas) {
    canvas.width = 1;
    canvas.height = 1;
  }
}

function openFileDialog(): void {
  if (!fileInput.value) return;
  fileInput.value.value = '';
  fileInput.value.click();
}

function parseHeader(buffer: ArrayBuffer): PsdHeader {
  if (buffer.byteLength < 26) throw new Error('PSD 文件头不完整。');
  const header = new DataView(buffer, 0, 26);
  if (header.getUint32(0, false) !== 0x38425053) throw new Error('不是有效的 PSD 文件。');
  if (header.getUint16(4, false) === 2) throw new Error('暂不支持 PSB 大型文档格式。');
  if (header.getUint16(4, false) !== 1) throw new Error('PSD 文件版本不受支持。');
  return {
    channels: header.getUint16(12, false),
    height: header.getUint32(14, false),
    width: header.getUint32(18, false),
    bitsPerChannel: header.getUint16(22, false),
    colorMode: header.getUint16(24, false),
  };
}

function reasonForCompatibility(file: File, header: PsdHeader): string | null {
  const pixels = header.width * header.height;
  const estimatedMemory = pixels * 4 + file.size;
  const reasons: string[] = [];
  if (file.size > DEFAULT_MAX_FILE_SIZE)
    reasons.push(`文件大小 ${formatBytes(file.size)} 超过 200 MB`);
  if (pixels > DEFAULT_MAX_PIXELS)
    reasons.push(`画布 ${Math.round(pixels / 1_000_000)} MP 超过 60 MP`);
  if (estimatedMemory > DEFAULT_MEMORY_BUDGET) {
    reasons.push(`预估解码内存 ${formatBytes(estimatedMemory)} 超过 512 MB`);
  }
  return reasons.length ? reasons.join('；') : null;
}

function unsupportedPsdReason(header: PsdHeader): string | null {
  if (header.bitsPerChannel !== 8) {
    return '当前 PSD 为非 8 位/通道，ag-psd 暂不支持读取 16 位等高位深合成图。';
  }
  if ([2, 4, 7, 8, 9].includes(header.colorMode)) {
    return '当前 PSD 使用的色彩模式不受 ag-psd 支持，无法安全读取合成图。';
  }
  return null;
}

async function acceptFile(file: File): Promise<void> {
  resetPreview();
  selectedFile.value = file;
  if (!isPsdFile(file)) {
    setError('请选择扩展名为 .psd 的 Photoshop 文件。');
    return;
  }
  if (file.size <= 0) {
    setError('该 PSD 文件为空。');
    return;
  }
  if (file.size > COMPATIBILITY_MAX_FILE_SIZE) {
    setError(
      `文件大小超过兼容模式上限 ${formatBytes(COMPATIBILITY_MAX_FILE_SIZE)}，为防止浏览器失去响应，无法解析。`,
    );
    return;
  }

  status.value = 'reading';
  progress.value = 10;
  message.value = '正在校验 PSD 文件…';
  try {
    const header = parseHeader(await file.slice(0, 26).arrayBuffer());
    const unsupportedReason = unsupportedPsdReason(header);
    if (unsupportedReason) {
      setError(unsupportedReason);
      return;
    }
    const pixels = header.width * header.height;
    if (pixels > COMPATIBILITY_MAX_PIXELS) {
      setError(
        `画布达到 ${Math.round(pixels / 1_000_000)} MP，超过兼容模式上限 100 MP，无法安全解析。`,
      );
      return;
    }
    const reason = reasonForCompatibility(file, header);
    if (reason) {
      compatibilityHeader.value = header;
      compatibilityReason.value = reason;
      status.value = 'compatibility';
      message.value = '';
      return;
    }
    await parseFile(file, false);
  } catch (error) {
    setError(error instanceof Error ? error.message : 'PSD 文件校验失败。');
  }
}

async function parseFile(file: File, compatibilityMode: boolean): Promise<void> {
  stopParsing();
  status.value = 'reading';
  progress.value = 24;
  message.value = '正在读取本地文件…';
  try {
    const buffer = await file.arrayBuffer();
    if (selectedFile.value !== file) return;
    progress.value = 45;
    message.value = '正在工作线程中解析合成图…';
    const worker = new Worker(new URL('../workers/psd.worker.ts', import.meta.url), {
      type: 'module',
    });
    parserWorker = worker;
    worker.onmessage = async (
      event: MessageEvent<{
        type: string;
        message?: string;
        metadata?: PsdMetadata;
        bitmap?: ImageBitmap;
      }>,
    ) => {
      if (worker !== parserWorker) return;
      if (event.data.type === 'error') {
        setError(event.data.message ?? 'PSD 解析失败。');
        return;
      }
      if (event.data.type !== 'success' || !event.data.metadata || !event.data.bitmap) return;
      progress.value = 86;
      message.value = '正在准备画布预览…';
      try {
        metadata.value = event.data.metadata;
        status.value = 'ready';
        await renderPreview(event.data.bitmap);
        progress.value = 100;
        message.value = '';
      } catch (error) {
        setError(error instanceof Error ? error.message : '无法创建预览画布。');
      } finally {
        event.data.bitmap.close();
        worker.terminate();
        if (parserWorker === worker) parserWorker = null;
      }
    };
    worker.onerror = () => setError('PSD 解析工作线程异常结束。');
    worker.postMessage({ type: 'parse', buffer, compatibilityMode }, [buffer]);
  } catch (error) {
    setError(error instanceof Error ? error.message : '读取本地文件失败。');
  }
}

async function continueCompatibilityMode(): Promise<void> {
  const file = selectedFile.value;
  if (!file || !compatibilityHeader.value) return;
  const pixels = compatibilityHeader.value.width * compatibilityHeader.value.height;
  const estimate = pixels * 4 + file.size;
  if (estimate > COMPATIBILITY_MEMORY_BUDGET) {
    setError('预估解码内存超过兼容模式 1 GB 预算，无法安全解析。');
    return;
  }
  await parseFile(file, true);
}

async function renderPreview(bitmap: ImageBitmap): Promise<void> {
  await nextTick();
  const canvas = canvasElement.value;
  if (!canvas) throw new Error('预览画布不可用。');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('预览画布初始化失败。');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  await nextTick();
  if (viewportElement.value) resizeObserver?.observe(viewportElement.value);
  fitToViewport();
}

function fitToViewport(): void {
  const viewport = viewportElement.value;
  const info = metadata.value;
  if (!viewport || !info) return;
  const horizontal = Math.max(1, (viewport.clientWidth - 48) / info.width);
  const vertical = Math.max(1, (viewport.clientHeight - 48) / info.height);
  zoom.value = Math.min(horizontal, vertical, 1);
  pan.value = { x: 0, y: 0 };
}

function setZoom(nextZoom: number): void {
  zoom.value = Math.max(0.05, Math.min(8, nextZoom));
}

function zoomBy(factor: number): void {
  setZoom(zoom.value * factor);
}

function resetToOriginal(): void {
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
}

function sourcePoint(clientX: number, clientY: number): { x: number; y: number } | null {
  const viewport = viewportElement.value;
  const info = metadata.value;
  if (!viewport || !info) return null;
  const rect = viewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - rect.width / 2 - pan.value.x) / zoom.value + info.width / 2,
    y: (clientY - rect.top - rect.height / 2 - pan.value.y) / zoom.value + info.height / 2,
  };
}

function updatePointer(event: Pick<MouseEvent, 'clientX' | 'clientY'>): void {
  const point = sourcePoint(event.clientX, event.clientY);
  const canvas = canvasElement.value;
  const info = metadata.value;
  if (
    !point ||
    !canvas ||
    !info ||
    point.x < 0 ||
    point.y < 0 ||
    point.x >= info.width ||
    point.y >= info.height
  ) {
    pointer.value = { x: 0, y: 0, color: '' };
    return;
  }
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  const data = canvas.getContext('2d', { willReadFrequently: true })?.getImageData(x, y, 1, 1).data;
  pointer.value = {
    x,
    y,
    color: data ? `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${(data[3] / 255).toFixed(2)})` : '',
  };
}

function handleWheel(event: WheelEvent): void {
  if (!hasPreview.value) return;
  event.preventDefault();
  const before = sourcePoint(event.clientX, event.clientY);
  const factor = event.deltaY > 0 ? 0.88 : 1.14;
  setZoom(zoom.value * factor);
  const after = sourcePoint(event.clientX, event.clientY);
  if (before && after) {
    pan.value = {
      x: pan.value.x + (after.x - before.x) * zoom.value,
      y: pan.value.y + (after.y - before.y) * zoom.value,
    };
  }
  updatePointer(event);
}

function beginDrag(event: PointerEvent): void {
  if (!hasPreview.value || event.button !== 0) return;
  dragStart = { x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y };
  isDragging.value = true;
  viewportElement.value?.setPointerCapture(event.pointerId);
}

function moveDrag(event: PointerEvent): void {
  if (dragStart) {
    pan.value = {
      x: dragStart.panX + event.clientX - dragStart.x,
      y: dragStart.panY + event.clientY - dragStart.y,
    };
  }
  updatePointer(event);
}

function endDrag(event: PointerEvent): void {
  dragStart = null;
  isDragging.value = false;
  if (viewportElement.value?.hasPointerCapture(event.pointerId)) {
    viewportElement.value.releasePointerCapture(event.pointerId);
  }
}

async function toggleFullscreen(): Promise<void> {
  const viewer = viewerElement.value;
  if (!viewer) return;
  try {
    if (document.fullscreenElement === viewer) await document.exitFullscreen();
    else await viewer.requestFullscreen();
  } catch {
    message.value = '当前浏览器不支持全屏预览。';
  }
}

function syncFullscreen(): void {
  isFullscreen.value = document.fullscreenElement === viewerElement.value;
  window.setTimeout(fitToViewport, 50);
}

async function createExportBlob(mimeOverride?: ExportMime): Promise<Blob> {
  const source = canvasElement.value;
  const info = metadata.value;
  if (!source || !info) throw new Error('没有可导出的 PSD 预览。');
  if (exportBlocked.value) throw new Error('导出尺寸超过 120 MP 限制，请降低导出缩放比例。');
  const scale = exportScale.value / 100;
  const width = Math.max(1, Math.round(info.width * scale));
  const height = Math.max(1, Math.round(info.height * scale));
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const mime = mimeOverride ?? exportMime.value;
  const preserveTransparency = keepTransparency.value && mime !== 'image/jpeg';
  const context = output.getContext('2d', { alpha: preserveTransparency });
  if (!context) throw new Error('导出画布不可用。');
  if (!preserveTransparency) {
    context.fillStyle = background.value === 'black' ? '#000000' : '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    output.toBlob(resolve, mime, mime !== 'image/png' ? exportQuality.value / 100 : undefined),
  );
  if (!blob) throw new Error('浏览器未能生成导出文件。');
  return blob;
}

async function exportImage(): Promise<void> {
  if (isExporting.value) return;
  isExporting.value = true;
  message.value = '';
  try {
    const blob = await createExportBlob();
    const baseName = selectedFile.value?.name.replace(/\.psd$/i, '') || 'psd-preview';
    const extension = exportMime.value.replace('image/', '').replace('jpeg', 'jpg');
    downloadBlob(blob, `${baseName}.${extension}`);
    message.value = '预览图已导出。';
  } catch (error) {
    message.value = error instanceof Error ? error.message : '预览图导出失败。';
  } finally {
    isExporting.value = false;
  }
}

async function copyPreview(): Promise<void> {
  try {
    const blob = await createExportBlob('image/png');
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error('当前浏览器不支持复制图片到剪贴板。');
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    copied.value = true;
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => (copied.value = false), 1800);
  } catch (error) {
    message.value = error instanceof Error ? error.message : '复制预览图失败。';
  }
}

function handleInput(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void acceptFile(file);
}

onMounted(() => {
  const { take } = useFileHandoff();
  const handoff = take('psd');
  if (handoff) void acceptFile(handoff);
  stopWindowFileHandoff = receiveWindowFileHandoff('psd', (file) => {
    void acceptFile(file);
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  resizeObserver = new ResizeObserver(() => {
    if (hasPreview.value) fitToViewport();
  });
  if (viewportElement.value) resizeObserver.observe(viewportElement.value);
});

onBeforeUnmount(() => {
  stopParsing();
  stopWindowFileHandoff();
  resizeObserver?.disconnect();
  document.removeEventListener('fullscreenchange', syncFullscreen);
  window.clearTimeout(copiedTimer);
});
</script>

<template>
  <component :is="embedded ? 'div' : 'main'" class="psd-viewer-page">
    <input
      ref="fileInput"
      class="sr-only"
      type="file"
      accept=".psd,image/vnd.adobe.photoshop"
      tabindex="-1"
      @change="handleInput"
    />

    <ImageToolHeader
      title="PSD 查看"
      description="本地解析 Photoshop 合成图并导出预览。"
      :icon="IconBrandAdobePhotoshop"
    />

    <section ref="viewerElement" class="psd-viewer tool-workbench" aria-label="PSD 查看器">
      <div class="tool-workbench__privacy">本地处理 · 文件不上传</div>

      <div v-if="status === 'idle' || status === 'error'" class="psd-viewer__empty">
        <p v-if="status === 'error'" class="psd-viewer__error" role="alert">{{ message }}</p>
        <ImageDropzone
          accept=".psd,image/vnd.adobe.photoshop"
          description="支持 Photoshop PSD，默认最大 200 MB / 60 MP"
          :multiple="false"
          prompt="拖入、粘贴 PSD，或点击选择本地文件"
          @files="(files) => files[0] && acceptFile(files[0])"
        />
      </div>

      <div v-else-if="status === 'compatibility'" class="psd-viewer__compatibility" role="alert">
        <h2>文件需要兼容模式</h2>
        <p>
          {{ compatibilityReason }}。兼容模式会将解码预算提高到 1
          GB，处理期间浏览器内存占用会明显增加。
        </p>
        <div class="psd-viewer__actions">
          <button
            type="button"
            class="psd-viewer__button psd-viewer__button--primary"
            @click="continueCompatibilityMode"
          >
            继续兼容模式
          </button>
          <button type="button" class="psd-viewer__button" @click="openFileDialog">
            选择其他文件
          </button>
        </div>
      </div>

      <div v-else-if="status === 'reading'" class="psd-viewer__progress" role="status">
        <span class="psd-viewer__progress-ring" aria-hidden="true" />
        <strong>{{ message }}</strong>
        <div class="psd-viewer__progress-track"><span :style="{ width: `${progress}%` }" /></div>
        <button
          type="button"
          class="psd-viewer__button"
          @click="
            resetPreview();
            status = 'idle';
          "
        >
          <IconX :size="17" /> 取消解析
        </button>
      </div>

      <div v-else class="psd-viewer__workspace">
        <div class="psd-viewer__toolbar">
          <div class="psd-viewer__file-name">
            <IconBrandAdobePhotoshop :size="18" /> <strong>{{ selectedFile?.name }}</strong>
          </div>
          <div class="psd-viewer__toolbar-actions">
            <span class="psd-viewer__backgrounds" aria-label="预览背景">
              <button
                type="button"
                class="psd-viewer__background-swatch psd-viewer__background-swatch--checkerboard"
                :class="{
                  'psd-viewer__background-swatch--selected': background === 'checkerboard',
                }"
                aria-label="透明背景"
                title="透明背景"
                @click="background = 'checkerboard'"
              />
              <button
                type="button"
                class="psd-viewer__background-swatch psd-viewer__background-swatch--white"
                :class="{ 'psd-viewer__background-swatch--selected': background === 'white' }"
                aria-label="白色背景"
                title="白色背景"
                @click="background = 'white'"
              />
              <button
                type="button"
                class="psd-viewer__background-swatch psd-viewer__background-swatch--black"
                :class="{ 'psd-viewer__background-swatch--selected': background === 'black' }"
                aria-label="黑色背景"
                title="黑色背景"
                @click="background = 'black'"
              />
            </span>
            <button
              type="button"
              class="psd-viewer__icon-button"
              title="缩小"
              aria-label="缩小"
              @click="zoomBy(0.8)"
            >
              <IconZoomOut :size="18" />
            </button>
            <button
              type="button"
              class="psd-viewer__zoom"
              title="恢复原始尺寸"
              @click="resetToOriginal"
            >
              {{ zoomLabel }}
            </button>
            <button
              type="button"
              class="psd-viewer__icon-button"
              title="放大"
              aria-label="放大"
              @click="zoomBy(1.25)"
            >
              <IconZoomIn :size="18" />
            </button>
            <button
              type="button"
              class="psd-viewer__icon-button"
              title="适应窗口"
              aria-label="适应窗口"
              @click="fitToViewport"
            >
              <IconRefresh :size="18" />
            </button>
            <button
              type="button"
              class="psd-viewer__icon-button"
              :title="isFullscreen ? '退出全屏' : '全屏预览'"
              :aria-label="isFullscreen ? '退出全屏' : '全屏预览'"
              @click="toggleFullscreen"
            >
              <IconArrowsMinimize v-if="isFullscreen" :size="18" /><IconArrowsMaximize
                v-else
                :size="18"
              />
            </button>
            <button type="button" class="psd-viewer__button" @click="openFileDialog">
              <IconUpload :size="17" />重新选择
            </button>
          </div>
        </div>

        <div
          ref="viewportElement"
          class="psd-viewer__viewport"
          :class="[
            `psd-viewer__viewport--${background}`,
            { 'psd-viewer__viewport--dragging': isDragging },
          ]"
          @wheel="handleWheel"
          @pointerdown="beginDrag"
          @pointermove="moveDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
          @dblclick="fitToViewport"
        >
          <canvas
            ref="canvasElement"
            class="psd-viewer__canvas"
            :style="{
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }"
          />
          <div class="psd-viewer__coordinates" aria-live="polite">
            <template v-if="pointer.color"
              >{{ pointer.x }}, {{ pointer.y }} · {{ pointer.color }}</template
            >
            <template v-else>移动鼠标查看坐标和像素颜色</template>
          </div>
        </div>

        <div class="psd-viewer__lower">
          <section class="psd-viewer__info" aria-labelledby="psd-info-title">
            <h2 id="psd-info-title">文件信息</h2>
            <dl>
              <template v-for="row in infoRows" :key="row[0]">
                <dt>{{ row[0] }}</dt>
                <dd>{{ row[1] }}</dd>
              </template>
            </dl>
          </section>
          <section class="psd-viewer__export" aria-labelledby="psd-export-title">
            <h2 id="psd-export-title">导出预览图</h2>
            <label
              >格式
              <span class="psd-viewer__select"
                ><select v-model="exportMime">
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/webp">WebP</option></select
                ><IconChevronDown :size="16"
              /></span>
            </label>
            <label v-if="qualityEnabled"
              >质量 <output>{{ exportQuality }}%</output
              ><input v-model.number="exportQuality" type="range" min="40" max="100" step="1"
            /></label>
            <label
              >导出缩放 <output>{{ exportScale }}%</output
              ><input v-model.number="exportScale" type="range" min="10" max="200" step="10"
            /></label>
            <label class="psd-viewer__checkbox"
              ><input
                v-model="keepTransparency"
                type="checkbox"
                :disabled="exportMime === 'image/jpeg'"
              />保留透明背景</label
            >
            <p v-if="exportBlocked" class="psd-viewer__error">
              当前导出尺寸超过 120 MP，请降低缩放比例。
            </p>
            <p v-else class="psd-viewer__export-hint">
              预计 {{ Math.round((exportPixels / 1_000_000) * 10) / 10 }} MP · 背景：{{
                selectedBackgroundLabel
              }}
            </p>
            <div class="psd-viewer__actions">
              <button
                type="button"
                class="psd-viewer__button psd-viewer__button--primary"
                :disabled="isExporting || exportBlocked"
                @click="exportImage"
              >
                <IconDownload :size="17" />{{ isExporting ? '正在导出…' : '导出图片' }}
              </button>
              <button type="button" class="psd-viewer__button" @click="copyPreview">
                <IconCheck v-if="copied" :size="17" /><IconClipboard v-else :size="17" />{{
                  copied ? '已复制' : '复制预览图'
                }}
              </button>
            </div>
            <p v-if="message" class="psd-viewer__notice" role="status">{{ message }}</p>
          </section>
        </div>
      </div>
    </section>
  </component>
</template>
