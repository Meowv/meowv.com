<script setup lang="ts">
import {
  AlertCircle,
  CheckCircle2,
  Crop,
  Download,
  FileImage,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from '@/features/tools/tools/_shared/image/icons';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import CropEditor from '@/features/tools/tools/_shared/image/components/crop/CropEditor.vue';
import ImageToolHeader from '@/features/tools/tools/_shared/image/components/layout/ImageToolHeader.vue';
import ImageDropzone from '@/features/tools/tools/_shared/image/components/upload/ImageDropzone.vue';
import { useFileHandoff } from '@/core/browser/file-handoff';
import {
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  readImageDimensions,
} from '@/features/tools/tools/_shared/image/core/image/dimensions';
import { getOutputFilename } from '@/features/tools/tools/_shared/image/core/image/filename';
import {
  detectEncodingCapabilities,
  processImage,
} from '@/features/tools/tools/_shared/image/core/image/process';
import type { ImageDimensions, SourceRect } from '@/features/tools/tools/_shared/image/types/image';
import { formatBytes } from '@/features/tools/tools/_shared/image/format';

type OutputMime = 'image/png' | 'image/jpeg' | 'image/webp';

interface AspectPreset {
  id: string;
  label: string;
  ratio: number | null;
}

defineProps<{ embedded?: boolean }>();

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const acceptedInputExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']);

const aspectPresets: AspectPreset[] = [
  { id: 'free', label: '自由', ratio: null },
  { id: 'square', label: '1:1', ratio: 1 },
  { id: 'landscape', label: '4:3', ratio: 4 / 3 },
  { id: 'portrait', label: '3:4', ratio: 3 / 4 },
  { id: 'photo-landscape', label: '3:2', ratio: 3 / 2 },
  { id: 'photo-portrait', label: '2:3', ratio: 2 / 3 },
  { id: 'classic-landscape', label: '5:4', ratio: 5 / 4 },
  { id: 'classic-portrait', label: '4:5', ratio: 4 / 5 },
  { id: 'wide', label: '16:9', ratio: 16 / 9 },
  { id: 'story', label: '9:16', ratio: 9 / 16 },
];

const socialPresets: AspectPreset[] = [
  { id: 'wechat-avatar', label: '微信头像', ratio: 1 },
  { id: 'moments', label: '朋友圈', ratio: 1 },
  { id: 'xiaohongshu', label: '小红书', ratio: 3 / 4 },
  { id: 'douyin', label: '抖音', ratio: 9 / 16 },
  { id: 'instagram', label: 'Instagram', ratio: 4 / 5 },
];

const allAspectPresets = [...aspectPresets, ...socialPresets];

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref('');
const dimensions = ref<ImageDimensions | null>(null);
const cropRect = ref<SourceRect>({ x: 0, y: 0, width: 1, height: 1 });
const selectedAspectId = ref('free');
const zoom = ref(1);
const outputMime = ref<OutputMime>('image/png');
const quality = ref(90);
const isDragging = ref(false);
const isReading = ref(false);
const isExporting = ref(false);
const capabilityReady = ref(false);
const webpSupported = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
let loadSequence = 0;
let exportController: AbortController | null = null;
const downloadUrls = new Set<string>();
const downloadTimers = new Set<number>();

const selectedAspect = computed(
  () =>
    allAspectPresets.find((preset) => preset.id === selectedAspectId.value) ?? aspectPresets[0]!,
);

const outputOptions = computed<Array<{ label: string; value: OutputMime; enabled: boolean }>>(
  () => [
    { label: 'PNG', value: 'image/png', enabled: true },
    { label: 'JPEG', value: 'image/jpeg', enabled: true },
    {
      label: 'WebP',
      value: 'image/webp',
      enabled: capabilityReady.value && webpSupported.value,
    },
  ],
);

const roundedCropRect = computed<SourceRect>(() => {
  const source = dimensions.value;
  if (!source) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const x = Math.max(0, Math.min(Math.round(cropRect.value.x), source.width - 1));
  const y = Math.max(0, Math.min(Math.round(cropRect.value.y), source.height - 1));

  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(cropRect.value.width), source.width - x)),
    height: Math.max(1, Math.min(Math.round(cropRect.value.height), source.height - y)),
  };
});

const qualityEnabled = computed(
  () => outputMime.value === 'image/jpeg' || outputMime.value === 'image/webp',
);

const exportButtonText = computed(() => (isExporting.value ? '正在生成…' : '导出裁剪图片'));

function fitAspectRect(source: ImageDimensions, ratio: number | null): SourceRect {
  if (!ratio) {
    return { x: 0, y: 0, width: source.width, height: source.height };
  }

  let width = source.width;
  let height = width / ratio;
  if (height > source.height) {
    height = source.height;
    width = height * ratio;
  }

  return {
    x: (source.width - width) / 2,
    y: (source.height - height) / 2,
    width,
    height,
  };
}

function fileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
}

function releasePreviewUrl() {
  if (!previewUrl.value) {
    return;
  }
  URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

function verifyPreview(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      image.onload = null;
      image.onerror = null;
      image.src = '';
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    image.onload = () => finish();
    image.onerror = () => finish(new Error('图片预览解码失败'));
    image.decoding = 'async';
    image.src = url;
  });
}

async function selectFile(file: File) {
  errorMessage.value = '';
  successMessage.value = '';

  if (file.size === 0) {
    errorMessage.value = '这个文件没有内容，请选择有效的图片。';
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    errorMessage.value = `图片超过 ${formatBytes(MAX_FILE_SIZE)}，请先缩小文件后再试。`;
    return;
  }
  if (!acceptedInputExtensions.has(fileExtension(file.name))) {
    errorMessage.value = '当前裁剪支持 JPG、JPEG、PNG、WebP、GIF 和 BMP 图片。';
    return;
  }
  if (file.type && !file.type.startsWith('image/')) {
    errorMessage.value = '请选择图片文件，其他文件类型无法在此裁剪。';
    return;
  }

  const sequence = ++loadSequence;
  isReading.value = true;
  exportController?.abort();

  let nextPreviewUrl = '';
  try {
    const nextDimensions = await readImageDimensions(file);
    if (
      nextDimensions.width > MAX_IMAGE_SIDE ||
      nextDimensions.height > MAX_IMAGE_SIDE ||
      nextDimensions.width * nextDimensions.height > MAX_IMAGE_PIXELS
    ) {
      throw new RangeError('IMAGE_TOO_LARGE');
    }

    nextPreviewUrl = URL.createObjectURL(file);
    await verifyPreview(nextPreviewUrl);
    if (sequence !== loadSequence) {
      URL.revokeObjectURL(nextPreviewUrl);
      return;
    }

    releasePreviewUrl();
    selectedFile.value = file;
    previewUrl.value = nextPreviewUrl;
    dimensions.value = nextDimensions;
    cropRect.value = fitAspectRect(nextDimensions, selectedAspect.value.ratio);
    zoom.value = 1;
  } catch (error) {
    if (nextPreviewUrl) {
      URL.revokeObjectURL(nextPreviewUrl);
    }
    if (sequence !== loadSequence) {
      return;
    }

    errorMessage.value =
      error instanceof RangeError && error.message === 'IMAGE_TOO_LARGE'
        ? '图片像素尺寸过大（最长边限 32768 px、总像素限 5000 万），为避免浏览器内存不足，未载入该文件。'
        : '无法读取这张图片。文件可能已损坏，或格式不受当前浏览器支持。';
  } finally {
    if (sequence === loadSequence) {
      isReading.value = false;
    }
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
}

function onFileInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    void selectFile(file);
  }
}

function selectDropzoneFiles(files: File[]) {
  const [file] = files;
  if (file) {
    void selectFile(file);
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  isDragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    void selectFile(file);
  }
}

function onDragLeave(event: DragEvent) {
  const container = event.currentTarget as HTMLElement;
  const nextTarget = event.relatedTarget;
  if (!(nextTarget instanceof Node) || !container.contains(nextTarget)) {
    isDragging.value = false;
  }
}

function openFilePicker() {
  if (!isReading.value) {
    fileInput.value?.click();
  }
}

function setAspect(preset: AspectPreset) {
  selectedAspectId.value = preset.id;
  zoom.value = 1;
  if (dimensions.value) {
    cropRect.value = fitAspectRect(dimensions.value, preset.ratio);
  }
}

function resetCrop() {
  if (!dimensions.value) {
    return;
  }
  cropRect.value = fitAspectRect(dimensions.value, selectedAspect.value.ratio);
  zoom.value = 1;
  successMessage.value = '';
}

function clearFile() {
  loadSequence += 1;
  exportController?.abort();
  exportController = null;
  releasePreviewUrl();
  selectedFile.value = null;
  dimensions.value = null;
  cropRect.value = { x: 0, y: 0, width: 1, height: 1 };
  zoom.value = 1;
  isReading.value = false;
  isExporting.value = false;
  errorMessage.value = '';
  successMessage.value = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadUrls.add(url);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();

  const timer = window.setTimeout(() => {
    URL.revokeObjectURL(url);
    downloadUrls.delete(url);
    downloadTimers.delete(timer);
  }, 1_000);
  downloadTimers.add(timer);
}

async function exportCrop() {
  const file = selectedFile.value;
  if (!file || !dimensions.value || isExporting.value) {
    return;
  }

  errorMessage.value = '';
  successMessage.value = '';
  exportController?.abort();
  const controller = new AbortController();
  exportController = controller;
  isExporting.value = true;

  try {
    const sourceRect = roundedCropRect.value;
    const result = await processImage(
      file,
      {
        sourceRect,
        outputSize: {
          width: sourceRect.width,
          height: sourceRect.height,
        },
        output: {
          mime: outputMime.value,
          quality: qualityEnabled.value ? quality.value / 100 : undefined,
          background: outputMime.value === 'image/jpeg' ? '#ffffff' : undefined,
        },
      },
      controller.signal,
    );

    if (controller.signal.aborted) {
      return;
    }

    const filename = getOutputFilename(file.name, result.mime, '-cropped');
    triggerDownload(result.blob, filename);
    successMessage.value = `已生成 ${result.width} × ${result.height} px 的 ${outputOptions.value.find((option) => option.value === outputMime.value)?.label ?? '图片'} 文件。`;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }
    errorMessage.value =
      error instanceof Error && error.message.includes('不支持')
        ? error.message
        : '裁剪导出失败。请确认图片未损坏，并尝试 PNG 或 JPEG 格式。';
  } finally {
    if (exportController === controller) {
      exportController = null;
      isExporting.value = false;
    }
  }
}

onMounted(async () => {
  const handoff = useFileHandoff().take('image');
  if (handoff) {
    selectDropzoneFiles([handoff]);
  }
  try {
    const capabilities = await detectEncodingCapabilities();
    webpSupported.value = capabilities.webp;
  } finally {
    capabilityReady.value = true;
  }
});

onBeforeUnmount(() => {
  loadSequence += 1;
  exportController?.abort();
  exportController = null;
  releasePreviewUrl();
  for (const timer of downloadTimers) {
    window.clearTimeout(timer);
  }
  downloadTimers.clear();
  for (const url of downloadUrls) {
    URL.revokeObjectURL(url);
  }
  downloadUrls.clear();
});
</script>

<template>
  <component
    :is="embedded ? 'div' : 'main'"
    id="main-content"
    class="min-h-[calc(100vh-4rem)] bg-transparent"
  >
    <input
      ref="fileInput"
      class="sr-only"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileInput"
    />

    <section class="image-crop-page">
      <ImageToolHeader
        title="图片裁剪"
        description="拖动裁剪框或控制点，按常用比例精确导出图片。"
        :icon="Crop"
      />

      <div class="tool-workbench" aria-label="图片裁剪工作台">
        <div class="tool-workbench__privacy" role="note">
          <ShieldCheck :size="16" aria-hidden="true" />
          <span>本地处理 · 文件不上传</span>
        </div>

        <div
          v-if="errorMessage"
          class="mx-auto mb-5 flex max-w-5xl items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
          role="alert"
        >
          <AlertCircle class="mt-0.5 shrink-0" :size="18" aria-hidden="true" />
          <span>{{ errorMessage }}</span>
        </div>

        <div
          v-if="successMessage"
          class="mx-auto mb-5 flex max-w-5xl items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
          role="status"
        >
          <CheckCircle2 class="mt-0.5 shrink-0" :size="18" aria-hidden="true" />
          <span>{{ successMessage }}</span>
        </div>

        <ImageDropzone
          v-if="!selectedFile"
          accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
          description="支持 JPG、JPEG、PNG、WebP、GIF 和 BMP，单个文件不超过 50 MB"
          :disabled="isReading"
          :multiple="false"
          @files="selectDropzoneFiles"
        />

        <div v-else-if="dimensions" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section
            class="relative min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
            @dragenter.prevent="isDragging = true"
            @dragover.prevent="isDragging = true"
            @dragleave="onDragLeave"
            @drop="onDrop"
          >
            <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-3">
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
                >
                  <FileImage :size="20" aria-hidden="true" />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {{ selectedFile.name }}
                  </p>
                  <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {{ dimensions.width }} × {{ dimensions.height }} px ·
                    {{ formatBytes(selectedFile.size) }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                  :disabled="isReading || isExporting"
                  @click="openFilePicker"
                >
                  <Upload :size="15" aria-hidden="true" />
                  更换
                </button>
                <button
                  type="button"
                  class="inline-grid size-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="移除当前图片"
                  :disabled="isExporting"
                  @click="clearFile"
                >
                  <X :size="18" aria-hidden="true" />
                </button>
              </div>
            </div>

            <CropEditor
              v-model="cropRect"
              v-model:zoom="zoom"
              :src="previewUrl"
              :source-width="dimensions.width"
              :source-height="dimensions.height"
              :aspect-ratio="selectedAspect.ratio"
              :disabled="isExporting"
            />

            <div
              v-if="isDragging"
              class="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-violet-500 bg-violet-50/95 text-center text-violet-700 backdrop-blur-sm dark:bg-violet-950/95 dark:text-violet-200"
            >
              <div>
                <Upload class="mx-auto mb-2" :size="30" aria-hidden="true" />
                <p class="font-semibold">松开以替换当前图片</p>
              </div>
            </div>
          </section>

          <aside class="space-y-4">
            <section
              class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div class="mb-4 flex items-center justify-between gap-3">
                <h2 class="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <Crop :size="18" aria-hidden="true" />
                  裁剪比例
                </h2>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  :disabled="isExporting"
                  @click="resetCrop"
                >
                  <RotateCcw :size="14" aria-hidden="true" />
                  重置
                </button>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="preset in aspectPresets"
                  :key="preset.id"
                  type="button"
                  class="rounded-lg border px-2 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  :class="
                    selectedAspectId === preset.id
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-violet-700 dark:hover:text-violet-300'
                  "
                  :aria-pressed="selectedAspectId === preset.id"
                  :disabled="isExporting"
                  @click="setAspect(preset)"
                >
                  {{ preset.label }}
                </button>
              </div>

              <div class="mt-5 border-t border-slate-200 pt-5 dark:border-slate-800">
                <h3 class="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  社交媒体比例
                </h3>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="preset in socialPresets"
                    :key="preset.id"
                    type="button"
                    class="rounded-lg border px-2 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                    :class="
                      selectedAspectId === preset.id
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-violet-700 dark:hover:text-violet-300'
                    "
                    :aria-pressed="selectedAspectId === preset.id"
                    :disabled="isExporting"
                    @click="setAspect(preset)"
                  >
                    {{ preset.label }}
                  </button>
                </div>
                <p class="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  使用常见构图比例裁剪，不会把图片上传到对应平台。
                </p>
              </div>
            </section>

            <section
              class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <h2 class="mb-4 font-semibold text-slate-900 dark:text-white">源图坐标</h2>
              <dl class="grid grid-cols-2 gap-2">
                <div class="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
                  <dt class="text-xs text-slate-500 dark:text-slate-400">X</dt>
                  <dd
                    class="mt-0.5 text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100"
                  >
                    {{ roundedCropRect.x }} px
                  </dd>
                </div>
                <div class="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
                  <dt class="text-xs text-slate-500 dark:text-slate-400">Y</dt>
                  <dd
                    class="mt-0.5 text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100"
                  >
                    {{ roundedCropRect.y }} px
                  </dd>
                </div>
                <div class="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
                  <dt class="text-xs text-slate-500 dark:text-slate-400">宽度</dt>
                  <dd
                    class="mt-0.5 text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100"
                  >
                    {{ roundedCropRect.width }} px
                  </dd>
                </div>
                <div class="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
                  <dt class="text-xs text-slate-500 dark:text-slate-400">高度</dt>
                  <dd
                    class="mt-0.5 text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100"
                  >
                    {{ roundedCropRect.height }} px
                  </dd>
                </div>
              </dl>
            </section>

            <section
              class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <h2 class="mb-4 font-semibold text-slate-900 dark:text-white">导出设置</h2>

              <fieldset>
                <legend class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  图片格式
                </legend>
                <div class="grid grid-cols-3 gap-2">
                  <label
                    v-for="option in outputOptions"
                    :key="option.value"
                    class="cursor-pointer rounded-lg border px-2 py-2 text-center text-sm font-medium transition focus-within:outline-none focus-within:ring-2 focus-within:ring-violet-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-slate-900"
                    :class="
                      !option.enabled
                        ? 'cursor-not-allowed border-slate-200 text-slate-400 opacity-60 dark:border-slate-700 dark:text-slate-600'
                        : outputMime === option.value
                          ? 'border-violet-600 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
                          : 'border-slate-200 text-slate-600 hover:border-violet-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-violet-700'
                    "
                    :title="
                      option.value === 'image/webp' && !option.enabled
                        ? capabilityReady
                          ? '当前浏览器不支持 WebP 编码'
                          : '正在检测 WebP 编码能力'
                        : undefined
                    "
                  >
                    <input
                      v-model="outputMime"
                      class="sr-only"
                      type="radio"
                      name="output-format"
                      :value="option.value"
                      :disabled="isExporting || !option.enabled"
                    />
                    {{ option.label }}
                  </label>
                </div>
              </fieldset>

              <div v-if="qualityEnabled" class="mt-5">
                <div class="mb-2 flex items-center justify-between text-sm">
                  <label class="font-medium text-slate-700 dark:text-slate-300" for="crop-quality">
                    输出质量
                  </label>
                  <output class="tabular-nums text-slate-500 dark:text-slate-400">
                    {{ quality }}%
                  </output>
                </div>
                <input
                  id="crop-quality"
                  v-model.number="quality"
                  class="h-1 w-full cursor-pointer accent-violet-600"
                  type="range"
                  min="20"
                  max="100"
                  step="1"
                  :disabled="isExporting"
                />
              </div>

              <p
                v-if="outputMime === 'image/jpeg'"
                class="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400"
              >
                JPEG 不支持透明通道，透明区域将自动填充为白色。
              </p>

              <button
                type="button"
                class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-none dark:focus-visible:ring-violet-900"
                :disabled="isExporting || isReading"
                @click="exportCrop"
              >
                <Download :size="18" aria-hidden="true" />
                {{ exportButtonText }}
              </button>
            </section>
          </aside>
        </div>
      </div>
    </section>
  </component>
</template>
