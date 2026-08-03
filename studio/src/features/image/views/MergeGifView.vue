<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Download,
  Film,
  GripVertical,
  Info,
  LoaderCircle,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from '@/features/image/icons';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import ImageDropzone from '@/features/image/components/upload/ImageDropzone.vue';
import ImageToolHeader from '@/features/image/components/layout/ImageToolHeader.vue';
import {
  encodeGifAnimation,
  MAX_GIF_FRAMES,
  MAX_GIF_SIDE,
  MAX_GIF_TOTAL_PIXELS,
  type GifFrame,
} from '@/features/image/core/image/gif';
import {
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  readImageDimensions,
} from '@/features/image/core/image/dimensions';
import { sanitizeSvgFile } from '@/features/image/core/image/process';
import { downloadBlob } from '@/features/image/utils/download';
import { formatBytes } from '@/features/image/utils/format';

interface GifSource {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

interface DecodedSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const acceptedExtensions = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'ico',
  'heic',
  'heif',
  'svg',
]);

const sources = ref<GifSource[]>([]);
const isAdding = ref(false);
const isGenerating = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const outputWidth = ref(800);
const outputHeight = ref(600);
const frameDelay = ref(500);
const loopMode = ref<'infinite' | 'once' | 'count'>('infinite');
const playbackCount = ref(3);
const background = ref('#ffffff');
const resultBlob = ref<Blob | null>(null);
const resultUrl = ref('');
const continueInputRef = ref<HTMLInputElement | null>(null);
const draggingId = ref('');
const orderMessage = ref('');
let addSequence = 0;
let addingController: AbortController | null = null;
let generationController: AbortController | null = null;
let sourceId = 0;

const isBusy = computed(() => isAdding.value || isGenerating.value);
const totalSourceBytes = computed(() =>
  sources.value.reduce((total, item) => total + item.file.size, 0),
);
const totalOutputPixels = computed(
  () =>
    Math.max(0, Math.round(outputWidth.value || 0)) *
    Math.max(0, Math.round(outputHeight.value || 0)) *
    sources.value.length,
);
const canGenerate = computed(
  () =>
    sources.value.length > 0 && !isBusy.value && totalOutputPixels.value <= MAX_GIF_TOTAL_PIXELS,
);
const framesPerSecond = computed({
  get: () => Math.round((1000 / Math.max(1, frameDelay.value)) * 10) / 10,
  set: (value: number) => {
    const normalized = Math.max(0.5, Math.min(20, Number(value) || 0.5));
    frameDelay.value = Math.round(1000 / normalized);
  },
});

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function releaseResult() {
  if (resultUrl.value) {
    URL.revokeObjectURL(resultUrl.value);
    resultUrl.value = '';
  }
  resultBlob.value = null;
  successMessage.value = '';
}

function invalidateResult() {
  if (!isGenerating.value) {
    releaseResult();
  }
}

function releaseSource(source: GifSource) {
  URL.revokeObjectURL(source.previewUrl);
}

function fitWithinLimit(width: number, height: number) {
  const scale = Math.min(1, MAX_GIF_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function normalizeSourceFile(file: File): Promise<File> {
  return fileExtension(file.name) === 'svg' || file.type === 'image/svg+xml'
    ? sanitizeSvgFile(file)
    : file;
}

async function addFiles(files: File[]) {
  if (isBusy.value || files.length === 0) {
    return;
  }

  errorMessage.value = '';
  const remaining = MAX_GIF_FRAMES - sources.value.length;
  if (remaining <= 0) {
    errorMessage.value = `最多添加 ${MAX_GIF_FRAMES} 帧，请先移除部分图片。`;
    return;
  }

  const sequence = ++addSequence;
  const controller = new AbortController();
  addingController = controller;
  const candidates = files.slice(0, remaining);
  const rejected: string[] = [];
  const accepted: GifSource[] = [];
  isAdding.value = true;

  try {
    for (const originalFile of candidates) {
      if (sequence !== addSequence) {
        break;
      }

      const extension = fileExtension(originalFile.name);
      if (!acceptedExtensions.has(extension)) {
        rejected.push(`${originalFile.name}：格式不支持`);
        continue;
      }
      if (originalFile.size === 0 || originalFile.size > MAX_FILE_BYTES) {
        rejected.push(`${originalFile.name}：文件需大于 0 且不超过 ${formatBytes(MAX_FILE_BYTES)}`);
        continue;
      }

      try {
        const file = await normalizeSourceFile(originalFile);
        const dimensions = await readImageDimensions(file);
        if (
          dimensions.width > MAX_IMAGE_SIDE ||
          dimensions.height > MAX_IMAGE_SIDE ||
          dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
        ) {
          throw new RangeError('IMAGE_TOO_LARGE');
        }
        const decoded = await decodeSource(file, controller.signal);
        decoded.dispose();
        if (sequence !== addSequence) {
          break;
        }

        const previewUrl = URL.createObjectURL(file);
        accepted.push({
          id: `gif-frame-${Date.now()}-${sourceId++}`,
          file,
          previewUrl,
          width: dimensions.width,
          height: dimensions.height,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          break;
        }
        rejected.push(`${originalFile.name}：无法安全读取或浏览器不支持解码`);
      }
    }

    if (sequence !== addSequence) {
      accepted.forEach(releaseSource);
      return;
    }

    const wasEmpty = sources.value.length === 0;
    sources.value.push(...accepted);
    if (wasEmpty && accepted[0]) {
      const fitted = fitWithinLimit(accepted[0].width, accepted[0].height);
      outputWidth.value = fitted.width;
      outputHeight.value = fitted.height;
    }
    if (accepted.length > 0) {
      releaseResult();
    }

    if (files.length > candidates.length) {
      rejected.push(`超出上限的 ${files.length - candidates.length} 张图片未添加`);
    }
    if (rejected.length > 0) {
      errorMessage.value = rejected.slice(0, 4).join('；');
    }
  } finally {
    if (addingController === controller) {
      addingController = null;
    }
    if (sequence === addSequence) {
      isAdding.value = false;
    }
  }
}

function selectMoreFiles() {
  if (!isBusy.value) {
    continueInputRef.value?.click();
  }
}

function onContinueInput(event: Event) {
  const input = event.target as HTMLInputElement;
  void addFiles(Array.from(input.files ?? []));
  input.value = '';
}

function removeSource(index: number) {
  if (isBusy.value) {
    return;
  }
  const [removed] = sources.value.splice(index, 1);
  if (removed) {
    releaseSource(removed);
  }
  releaseResult();
}

function moveSource(index: number, direction: -1 | 1) {
  if (isBusy.value) {
    return;
  }
  const target = index + direction;
  if (target < 0 || target >= sources.value.length) {
    return;
  }
  const [source] = sources.value.splice(index, 1);
  if (source) {
    sources.value.splice(target, 0, source);
    releaseResult();
    orderMessage.value = `${source.file.name} 已移动到第 ${target + 1} 帧`;
  }
}

function startDrag(event: DragEvent, item: GifSource) {
  if (isBusy.value) {
    event.preventDefault();
    return;
  }
  draggingId.value = item.id;
  event.dataTransfer?.setData('text/plain', item.id);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function moveDraggedTo(targetIndex: number) {
  if (!draggingId.value || isBusy.value) {
    return;
  }
  const currentIndex = sources.value.findIndex((item) => item.id === draggingId.value);
  if (currentIndex < 0 || currentIndex === targetIndex) {
    return;
  }
  const [source] = sources.value.splice(currentIndex, 1);
  if (source) {
    sources.value.splice(targetIndex, 0, source);
    releaseResult();
  }
}

function finishDrag() {
  const index = sources.value.findIndex((item) => item.id === draggingId.value);
  const source = sources.value[index];
  if (source) {
    orderMessage.value = `${source.file.name} 已移动到第 ${index + 1} 帧`;
  }
  draggingId.value = '';
}

function clearAll() {
  addSequence += 1;
  addingController?.abort();
  addingController = null;
  generationController?.abort();
  generationController = null;
  sources.value.forEach(releaseSource);
  sources.value = [];
  isAdding.value = false;
  isGenerating.value = false;
  errorMessage.value = '';
  releaseResult();
}

function resetSettings() {
  if (sources.value[0]) {
    const fitted = fitWithinLimit(sources.value[0].width, sources.value[0].height);
    outputWidth.value = fitted.width;
    outputHeight.value = fitted.height;
  } else {
    outputWidth.value = 800;
    outputHeight.value = 600;
  }
  frameDelay.value = 500;
  loopMode.value = 'infinite';
  playbackCount.value = 3;
  background.value = '#ffffff';
}

function abortError() {
  return new DOMException('GIF 生成已取消', 'AbortError');
}

function loadHtmlImage(file: File, signal: AbortSignal): Promise<DecodedSource> {
  const url = URL.createObjectURL(file);
  const image = new Image();

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanupListeners = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', onAbort);
    };
    const dispose = () => {
      cleanupListeners();
      image.src = '';
      URL.revokeObjectURL(url);
    };
    const onAbort = () => {
      if (!settled) {
        settled = true;
        dispose();
        reject(abortError());
      }
    };

    image.onload = () => {
      if (!settled) {
        settled = true;
        cleanupListeners();
        resolve({
          source: image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          dispose,
        });
      }
    };
    image.onerror = () => {
      if (!settled) {
        settled = true;
        dispose();
        reject(new TypeError('图片解码失败'));
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    image.decoding = 'async';
    image.src = url;
  });
}

async function decodeSource(file: File, signal: AbortSignal): Promise<DecodedSource> {
  if (signal.aborted) {
    throw abortError();
  }
  if (typeof createImageBitmap !== 'function') {
    return loadHtmlImage(file, signal);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    if (signal.aborted) {
      throw abortError();
    }
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return loadHtmlImage(file, signal);
    }
  }
  if (signal.aborted) {
    bitmap.close();
    throw abortError();
  }

  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    dispose: () => bitmap.close(),
  };
}

function boundedInteger(value: number, label: string, maximum: number) {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < 1 || rounded > maximum) {
    throw new RangeError(`${label}必须在 1–${maximum} 之间`);
  }
  return rounded;
}

async function renderFrames(
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<GifFrame[]> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('当前浏览器无法创建 Canvas 2D 上下文');
  }

  const frames: GifFrame[] = [];
  for (const item of sources.value) {
    if (signal.aborted) {
      throw abortError();
    }

    const decoded = await decodeSource(item.file, signal);
    try {
      context.fillStyle = background.value;
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      const scale = Math.min(width / decoded.width, height / decoded.height);
      const renderWidth = decoded.width * scale;
      const renderHeight = decoded.height * scale;
      context.drawImage(
        decoded.source,
        (width - renderWidth) / 2,
        (height - renderHeight) / 2,
        renderWidth,
        renderHeight,
      );
      const pixels = context.getImageData(0, 0, width, height);
      frames.push({
        data: new Uint8ClampedArray(pixels.data),
        width,
        height,
        delayMs: frameDelay.value,
      });
    } finally {
      decoded.dispose();
    }
  }
  return frames;
}

async function generateGif() {
  if (sources.value.length === 0 || isBusy.value) {
    return;
  }

  errorMessage.value = '';
  releaseResult();
  const controller = new AbortController();
  generationController = controller;
  isGenerating.value = true;

  try {
    const width = boundedInteger(outputWidth.value, '输出宽度', MAX_GIF_SIDE);
    const height = boundedInteger(outputHeight.value, '输出高度', MAX_GIF_SIDE);
    const delay = boundedInteger(frameDelay.value, '帧间隔', 10_000);
    const count =
      loopMode.value === 'count' ? boundedInteger(playbackCount.value, '播放次数', 100) : 1;
    if (width * height * sources.value.length > MAX_GIF_TOTAL_PIXELS) {
      throw new RangeError(
        `当前尺寸与帧数共 ${(width * height * sources.value.length).toLocaleString(
          'zh-CN',
        )} 像素，超过本地安全上限 ${MAX_GIF_TOTAL_PIXELS.toLocaleString('zh-CN')}。请减小尺寸或帧数。`,
      );
    }

    const frames = await renderFrames(width, height, controller.signal);
    const blob = encodeGifAnimation(frames, {
      width,
      height,
      delayMs: delay,
      loop:
        loopMode.value === 'infinite'
          ? 0
          : loopMode.value === 'once'
            ? null
            : count === 1
              ? null
              : count - 1,
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      return;
    }

    resultBlob.value = blob;
    resultUrl.value = URL.createObjectURL(blob);
    successMessage.value = `GIF 已生成：${sources.value.length} 帧，${width} × ${height} px，${formatBytes(blob.size)}。`;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      errorMessage.value = error instanceof Error ? error.message : 'GIF 生成失败，请稍后重试。';
    }
  } finally {
    if (generationController === controller) {
      generationController = null;
      isGenerating.value = false;
    }
  }
}

function downloadResult() {
  if (resultBlob.value && !isBusy.value) {
    downloadBlob(resultBlob.value, 'image-studio-animation.gif');
  }
}

watch(
  [outputWidth, outputHeight, frameDelay, loopMode, playbackCount, background],
  invalidateResult,
);

onBeforeUnmount(() => {
  addSequence += 1;
  addingController?.abort();
  generationController?.abort();
  sources.value.forEach(releaseSource);
  releaseResult();
});
</script>

<template>
  <main id="main-content" class="min-h-[calc(100vh-72px)] bg-[var(--page)]">
    <ImageToolHeader
      title="合并为 GIF"
      description="按图片顺序设置帧间隔、画布与循环方式，生成 GIF 动画。"
      :icon="Film"
    />

    <section class="tool-workbench" aria-label="合并 GIF 工作台">
      <div class="tool-workbench__privacy" role="note">
        <ShieldCheck :size="16" aria-hidden="true" />
        <span>本地处理 · 文件不上传</span>
      </div>
      <div
        v-if="errorMessage"
        class="mb-5 flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
        role="alert"
      >
        <span>{{ errorMessage }}</span>
        <button
          type="button"
          class="grid size-6 shrink-0 place-items-center rounded-md hover:bg-rose-100 dark:hover:bg-rose-900"
          aria-label="关闭错误提示"
          @click="errorMessage = ''"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </div>

      <div
        v-if="successMessage"
        class="mb-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 class="mt-0.5 shrink-0" :size="17" aria-hidden="true" />
        {{ successMessage }}
      </div>

      <div v-if="sources.length === 0" class="grid gap-3">
        <ImageDropzone :disabled="isBusy" @files="addFiles" />
        <p class="text-center text-xs leading-5 text-[var(--text-muted)]">
          最多 {{ MAX_GIF_FRAMES }} 帧；单张不超过
          {{ formatBytes(MAX_FILE_BYTES) }}。动画图片作为一张静态帧读取。
        </p>
        <p
          v-if="isAdding"
          class="inline-flex items-center justify-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300"
          role="status"
        >
          <LoaderCircle class="animate-spin" :size="17" aria-hidden="true" />
          正在安全读取图片…
        </p>
      </div>

      <div v-else class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="grid min-w-0 gap-5">
          <section class="surface-card overflow-hidden">
            <header
              class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5"
            >
              <div>
                <h2 class="text-sm font-bold text-[var(--text)]">
                  帧列表 · {{ sources.length }} 张
                </h2>
                <p class="mt-1 text-xs text-[var(--text-muted)]">
                  {{ formatBytes(totalSourceBytes) }} · 按当前列表从上到下播放
                </p>
              </div>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text-soft)] transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-45"
                  :disabled="isBusy || sources.length >= MAX_GIF_FRAMES"
                  @click="selectMoreFiles"
                >
                  <Plus :size="14" aria-hidden="true" />
                  继续添加
                </button>
                <input
                  ref="continueInputRef"
                  class="sr-only"
                  type="file"
                  multiple
                  tabindex="-1"
                  accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.ico,.heic,.heif,.svg"
                  :disabled="isBusy"
                  @change="onContinueInput"
                />
                <button
                  type="button"
                  class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-45 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                  :disabled="isBusy"
                  @click="clearAll"
                >
                  <Trash2 :size="14" aria-hidden="true" />
                  清空
                </button>
              </div>
            </header>

            <ol class="divide-y divide-[var(--border)]">
              <li
                v-for="(item, index) in sources"
                :key="item.id"
                class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5"
                :class="
                  draggingId === item.id ? 'bg-indigo-50/70 opacity-65 dark:bg-indigo-950/30' : ''
                "
                @dragover.prevent="moveDraggedTo(index)"
                @drop.prevent="finishDrag"
              >
                <div class="relative">
                  <img
                    class="size-14 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] object-cover"
                    :src="item.previewUrl"
                    alt=""
                  />
                  <span
                    class="absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow-sm"
                    aria-hidden="true"
                  >
                    {{ index + 1 }}
                  </span>
                </div>

                <div class="min-w-0">
                  <p
                    class="truncate text-sm font-semibold text-[var(--text)]"
                    :title="item.file.name"
                  >
                    {{ item.file.name }}
                  </p>
                  <p class="mt-1 text-xs text-[var(--text-muted)]">
                    {{ item.width }} × {{ item.height }} px ·
                    {{ formatBytes(item.file.size) }}
                  </p>
                </div>

                <div class="flex items-center gap-0.5">
                  <span
                    class="mr-1 hidden cursor-grab rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] active:cursor-grabbing sm:block"
                    draggable="true"
                    title="拖动调整顺序"
                    @dragstart="startDrag($event, item)"
                    @dragend="finishDrag"
                  >
                    <GripVertical :size="16" aria-hidden="true" />
                    <span class="sr-only">拖动第 {{ index + 1 }} 帧</span>
                  </span>
                  <button
                    type="button"
                    class="grid size-8 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-subtle)] hover:text-indigo-600 disabled:opacity-30"
                    :disabled="isBusy || index === 0"
                    :aria-label="`将第 ${index + 1} 帧上移`"
                    @click="moveSource(index, -1)"
                  >
                    <ArrowUp :size="16" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="grid size-8 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-subtle)] hover:text-indigo-600 disabled:opacity-30"
                    :disabled="isBusy || index === sources.length - 1"
                    :aria-label="`将第 ${index + 1} 帧下移`"
                    @click="moveSource(index, 1)"
                  >
                    <ArrowDown :size="16" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="grid size-8 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                    :disabled="isBusy"
                    :aria-label="`移除 ${item.file.name}`"
                    @click="removeSource(index)"
                  >
                    <X :size="16" aria-hidden="true" />
                  </button>
                </div>
              </li>
            </ol>
            <p class="sr-only" aria-live="polite">{{ orderMessage }}</p>
          </section>

          <section v-if="resultUrl" class="surface-card overflow-hidden">
            <header
              class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"
            >
              <div>
                <h2 class="text-sm font-bold text-[var(--text)]">GIF 预览</h2>
                <p class="mt-1 text-xs text-[var(--text-muted)]">浏览器会按实际循环和帧间隔播放</p>
              </div>
              <button
                type="button"
                class="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                :disabled="isBusy"
                @click="downloadResult"
              >
                <Download :size="16" aria-hidden="true" />
                下载 GIF
              </button>
            </header>
            <div class="checkerboard grid min-h-72 place-items-center p-5 sm:p-8">
              <img
                class="max-h-[560px] rounded-xl shadow-lg"
                :src="resultUrl"
                alt="生成的 GIF 动画预览"
              />
            </div>
          </section>
        </div>

        <aside class="grid gap-4 xl:sticky xl:top-[92px]" aria-label="GIF 参数">
          <section class="surface-card overflow-hidden">
            <header class="border-b border-[var(--border)] px-5 py-4">
              <div class="flex items-center justify-between gap-3">
                <h2 class="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                  <Settings2 class="text-indigo-600" :size="18" aria-hidden="true" />
                  动画设置
                </h2>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] disabled:opacity-45"
                  :disabled="isBusy"
                  @click="resetSettings"
                >
                  <RotateCcw :size="13" aria-hidden="true" />
                  重置
                </button>
              </div>
            </header>

            <div class="grid gap-5 p-5">
              <fieldset class="grid gap-3">
                <legend class="text-sm font-semibold text-[var(--text)]">输出画布</legend>
                <div class="grid grid-cols-2 gap-3">
                  <label class="grid gap-2 text-xs font-semibold text-[var(--text-soft)]">
                    宽度 px
                    <input
                      v-model.number="outputWidth"
                      class="h-10 min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                      type="number"
                      min="1"
                      :max="MAX_GIF_SIDE"
                      :disabled="isBusy"
                    />
                  </label>
                  <label class="grid gap-2 text-xs font-semibold text-[var(--text-soft)]">
                    高度 px
                    <input
                      v-model.number="outputHeight"
                      class="h-10 min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                      type="number"
                      min="1"
                      :max="MAX_GIF_SIDE"
                      :disabled="isBusy"
                    />
                  </label>
                </div>
                <p class="text-xs leading-5 text-[var(--text-muted)]">
                  每张图片会保持比例、居中完整放入画布；空余区域使用背景色。
                </p>
              </fieldset>

              <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                帧间隔
                <div class="grid grid-cols-[1fr_88px] items-center gap-3">
                  <input
                    v-model.number="frameDelay"
                    type="range"
                    min="50"
                    max="2000"
                    step="50"
                    :disabled="isBusy"
                  />
                  <span
                    class="grid h-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] text-xs tabular-nums"
                  >
                    {{ frameDelay }} ms
                  </span>
                </div>
              </label>

              <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                每秒帧数（FPS）
                <input
                  v-model.number="framesPerSecond"
                  class="h-10 min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                  type="number"
                  min="0.5"
                  max="20"
                  step="0.5"
                  :disabled="isBusy"
                />
                <span class="text-xs leading-5 font-normal text-[var(--text-muted)]">
                  与帧间隔自动联动，当前约
                  {{ framesPerSecond.toFixed(1) }} FPS。
                </span>
              </label>

              <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                循环方式
                <span class="image-select">
                  <select v-model="loopMode" class="image-select__control" :disabled="isBusy">
                    <option value="infinite">无限循环</option>
                    <option value="once">播放一次</option>
                    <option value="count">指定播放次数</option>
                  </select>
                  <ChevronDown class="image-select__icon" :size="18" aria-hidden="true" />
                </span>
              </label>

              <label
                v-if="loopMode === 'count'"
                class="grid gap-2 text-sm font-semibold text-[var(--text)]"
              >
                播放次数
                <input
                  v-model.number="playbackCount"
                  class="h-10 min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                  type="number"
                  min="1"
                  max="100"
                  :disabled="isBusy"
                />
              </label>

              <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                留白背景
                <span
                  class="flex h-11 items-center gap-3 rounded-xl border border-[var(--border-strong)] px-3"
                >
                  <input
                    v-model="background"
                    class="size-7 cursor-pointer rounded-md border-0 bg-transparent p-0"
                    type="color"
                    :disabled="isBusy"
                  />
                  <span class="text-xs font-mono text-[var(--text-soft)]">
                    {{ background.toUpperCase() }}
                  </span>
                </span>
              </label>

              <div
                class="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs leading-5 text-[var(--text-muted)]"
              >
                <p>
                  当前总处理像素：
                  <strong class="text-[var(--text)]">
                    {{ totalOutputPixels.toLocaleString('zh-CN') }}
                  </strong>
                </p>
                <p class="mt-1">
                  安全上限：
                  {{ MAX_GIF_TOTAL_PIXELS.toLocaleString('zh-CN') }}
                </p>
              </div>

              <button
                type="button"
                class="primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!canGenerate"
                @click="generateGif"
              >
                <LoaderCircle
                  v-if="isGenerating"
                  class="animate-spin"
                  :size="18"
                  aria-hidden="true"
                />
                <Film v-else :size="18" aria-hidden="true" />
                {{ isGenerating ? '正在生成 GIF…' : '生成 GIF 动画' }}
              </button>
              <p
                v-if="totalOutputPixels > MAX_GIF_TOTAL_PIXELS"
                class="text-xs leading-5 font-semibold text-rose-700 dark:text-rose-300"
              >
                当前尺寸与帧数超过安全上限，请减小画布或移除图片。
              </p>
            </div>
          </section>

          <div
            class="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100"
          >
            <Info class="mt-0.5 shrink-0" :size="17" aria-hidden="true" />
            <p>GIF 使用 256 色调色板，颜色可能比原图少；帧数、尺寸与间隔越大，文件通常越大。</p>
          </div>
        </aside>
      </div>
    </section>
  </main>
</template>
