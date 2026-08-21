<script setup lang="ts">
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileArchive,
  ImageDown,
  ImageUp,
  Info,
  LoaderCircle,
  Play,
  Plus,
  Resize,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from '@/features/tools/tools/_shared/image/icons';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useFileHandoff } from '@/core/browser/file-handoff';
import ImageTaskList from '@/features/tools/tools/_shared/image/components/batch/ImageTaskList.vue';
import ImageToolHeader from '@/features/tools/tools/_shared/image/components/layout/ImageToolHeader.vue';
import ImageDropzone from '@/features/tools/tools/_shared/image/components/upload/ImageDropzone.vue';
import { useImageWorkspace } from '@/features/tools/tools/_shared/image/composables/useImageWorkspace';
import {
  detectEncodingCapabilities,
  detectImageMime,
  INPUT_IMAGE_ACCEPT,
  isSupportedImageFilename,
  sanitizeSvgFile,
  type OutputMime,
} from '@/features/tools/tools/_shared/image/core/image';
import type {
  EncodingCapabilities,
  ImageTask,
  RenderSpec,
  ToolMode,
} from '@/features/tools/tools/_shared/image/types/image';
import { downloadBlob } from '@/core/browser/download';
import { formatBytes } from '@/features/tools/tools/_shared/image/format';

const props = defineProps<{
  mode: ToolMode;
  embedded?: boolean;
}>();

const { take: takeHandoffFile } = useFileHandoff();

const modeContent = {
  compress: {
    title: '图片压缩',
    description: '调节输出质量，批量减小图片体积并保留清晰画质。',
    icon: ImageDown,
    action: '开始批量压缩',
    suffix: '-compressed',
  },
  convert: {
    title: '格式转换',
    description: '在 PNG、JPEG、WebP、ICO 与 SVG 等格式之间转换。',
    icon: ImageUp,
    action: '开始批量转换',
    suffix: '-converted',
  },
  resize: {
    title: '尺寸调整',
    description: '按宽高、百分比或最大边批量调整图片尺寸。',
    icon: Resize,
    action: '开始批量调整',
    suffix: '-resized',
  },
} as const;

const {
  tasks,
  isProcessing,
  completedCount,
  resultEntries,
  addFiles,
  removeTask,
  resetAll,
  clear,
  cancel,
  processAll,
  createResultsZip,
} = useImageWorkspace();

const capabilities = ref<EncodingCapabilities>({
  jpeg: true,
  png: true,
  webp: false,
  ico: true,
  svg: true,
});
const capabilityReady = ref(false);
const globalMessage = ref('');
const globalError = ref('');
const isPackaging = ref(false);
const isAdding = ref(false);
const continueInputRef = ref<HTMLInputElement | null>(null);
let packagingController: AbortController | null = null;
let addSequence = 0;

const compressOutput = ref<'original' | OutputMime>('original');
const convertOutput = ref<OutputMime>('image/webp');
const resizeOutput = ref<'original' | OutputMime>('original');
const quality = ref(82);
const jpegBackground = ref('#ffffff');

type ResizeMode = 'fixed' | 'percent' | 'max';
const resizeMode = ref<ResizeMode>('fixed');
const targetWidth = ref(1920);
const targetHeight = ref(1080);
const resizePercent = ref(50);
const maxEdge = ref(1920);
const keepRatio = ref(true);

const content = computed(() => modeContent[props.mode]);
const successTasks = computed(() => tasks.value.filter((task) => Boolean(task.result)));
const totalOriginalBytes = computed(() =>
  tasks.value.reduce((sum, task) => sum + task.file.size, 0),
);
const totalResultBytes = computed(() =>
  resultEntries.value.reduce((sum, entry) => sum + entry.blob.size, 0),
);
const progressText = computed(() => {
  if (tasks.value.length === 0) {
    return '';
  }
  return `${completedCount.value} / ${tasks.value.length} 张完成`;
});
const workspaceBusy = computed(() => isAdding.value || isProcessing.value || isPackaging.value);

const formatOptions = computed(() => {
  const options = [
    {
      mime: 'image/jpeg' as const,
      label: 'JPEG',
      enabled: capabilities.value.jpeg,
    },
    {
      mime: 'image/png' as const,
      label: 'PNG',
      enabled: capabilities.value.png,
    },
    {
      mime: 'image/webp' as const,
      label: 'WebP',
      enabled: capabilities.value.webp,
    },
  ];

  if (props.mode !== 'convert') {
    return options;
  }

  return [
    ...options,
    {
      mime: 'image/vnd.microsoft.icon' as const,
      label: 'ICO',
      enabled: capabilities.value.ico,
    },
    {
      mime: 'image/svg+xml' as const,
      label: 'SVG（嵌入位图）',
      enabled: capabilities.value.svg,
    },
  ];
});

const selectedOutput = computed(() => {
  if (props.mode === 'compress') {
    return compressOutput.value;
  }
  if (props.mode === 'convert') {
    return convertOutput.value;
  }
  return resizeOutput.value;
});

const showQuality = computed(
  () =>
    selectedOutput.value === 'original' ||
    selectedOutput.value === 'image/jpeg' ||
    selectedOutput.value === 'image/webp',
);

const maxFileBytes = 50 * 1024 * 1024;
const maxTaskCount = 100;
const maxCanvasEdge = 16384;
const maxZipResultBytes = 256 * 1024 * 1024;

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

async function handleFiles(files: File[]) {
  if (isAdding.value || isProcessing.value || isPackaging.value) {
    return;
  }

  globalError.value = '';
  globalMessage.value = '';

  const remaining = Math.max(0, maxTaskCount - tasks.value.length);
  if (remaining === 0) {
    globalError.value = '一次最多处理 100 张图片，请先移除部分任务。';
    return;
  }

  const oversized = files.filter((file) => file.size > maxFileBytes);
  const unsupported = files.filter((file) => !isSupportedImageFilename(file.name));
  const valid = files
    .filter((file) => file.size <= maxFileBytes && isSupportedImageFilename(file.name))
    .slice(0, remaining);

  const sequence = ++addSequence;
  isAdding.value = true;
  try {
    if (valid.length > 0) {
      const preparedFiles = await Promise.all(
        valid.map((file) =>
          fileExtension(file.name) === 'svg' ? sanitizeSvgFile(file) : Promise.resolve(file),
        ),
      );
      if (sequence !== addSequence) {
        return;
      }
      await addFiles(preparedFiles);
    }

    const skipped = files.length - valid.length;
    const gifCount = valid.filter((file) => fileExtension(file.name) === 'gif').length;
    const gifNotice =
      gifCount > 0 ? ` ${gifCount} 张 GIF 会按当前解码帧处理，导出结果不保留动画。` : '';
    if (skipped > 0) {
      const reasons = [];
      if (oversized.length > 0) {
        reasons.push(`${oversized.length} 张超过 50 MB`);
      }
      if (unsupported.length > 0) {
        reasons.push(`${unsupported.length} 张格式不在首版支持范围`);
      }
      if (files.length > remaining) {
        reasons.push(`超出 100 张上限`);
      }
      globalMessage.value = `已添加 ${valid.length} 张，跳过 ${skipped} 张${reasons.length ? `（${reasons.join('、')}）` : ''}。${gifNotice}`;
    } else if (valid.length > 0) {
      globalMessage.value = `已添加 ${valid.length} 张图片，参数调整完成后即可开始。${gifNotice}`;
    }
  } catch (error) {
    globalError.value =
      error instanceof Error ? `图片读取失败：${error.message}` : '图片读取失败，请检查文件内容。';
  } finally {
    if (sequence === addSequence) {
      isAdding.value = false;
    }
  }
}

function selectMoreFiles(): void {
  if (!workspaceBusy.value) {
    continueInputRef.value?.click();
  }
}

function handleMoreFiles(event: Event): void {
  const input = event.target as HTMLInputElement;
  void handleFiles(Array.from(input.files ?? []));
  input.value = '';
}

function handleRemoveTask(id: string): void {
  if (!workspaceBusy.value) {
    removeTask(id);
  }
}

function capabilityForMime(mime: OutputMime): boolean {
  const key = mime.slice('image/'.length) as keyof EncodingCapabilities;
  return capabilities.value[key] ?? false;
}

async function sourceOutputMime(task: ImageTask): Promise<OutputMime> {
  const detected = await detectImageMime(task.file);
  if (
    (detected === 'image/jpeg' || detected === 'image/png' || detected === 'image/webp') &&
    capabilityForMime(detected)
  ) {
    return detected;
  }
  return 'image/png';
}

async function outputMimeForTask(task: ImageTask): Promise<OutputMime> {
  const requested =
    props.mode === 'compress'
      ? compressOutput.value
      : props.mode === 'convert'
        ? convertOutput.value
        : resizeOutput.value;

  if (requested === 'original') {
    return sourceOutputMime(task);
  }
  return requested;
}

function boundedInteger(value: number, label: string): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < 1 || rounded > maxCanvasEdge) {
    throw new RangeError(`${label}必须在 1 到 ${maxCanvasEdge} px 之间`);
  }
  return rounded;
}

function resizeDimensions(task: ImageTask) {
  if (resizeMode.value === 'percent') {
    const factor = Math.max(1, Math.min(400, resizePercent.value)) / 100;
    return {
      width: boundedInteger(task.width * factor, '输出宽度'),
      height: boundedInteger(task.height * factor, '输出高度'),
    };
  }

  if (resizeMode.value === 'max') {
    const target = boundedInteger(maxEdge.value, '最大边');
    const factor = Math.min(1, target / Math.max(task.width, task.height));
    return {
      width: boundedInteger(task.width * factor, '输出宽度'),
      height: boundedInteger(task.height * factor, '输出高度'),
    };
  }

  const width = boundedInteger(targetWidth.value, '输出宽度');
  const height = boundedInteger(targetHeight.value, '输出高度');
  if (!keepRatio.value) {
    return { width, height };
  }

  const factor = Math.min(width / task.width, height / task.height);
  return {
    width: boundedInteger(task.width * factor, '输出宽度'),
    height: boundedInteger(task.height * factor, '输出高度'),
  };
}

async function createSpec(task: ImageTask): Promise<RenderSpec> {
  const mime = await outputMimeForTask(task);
  const requestedOutputSize =
    props.mode === 'resize' ? resizeDimensions(task) : { width: task.width, height: task.height };
  const outputSize =
    mime === 'image/vnd.microsoft.icon'
      ? (() => {
          const factor = Math.min(
            1,
            256 / Math.max(requestedOutputSize.width, requestedOutputSize.height),
          );
          return {
            width: Math.max(1, Math.round(requestedOutputSize.width * factor)),
            height: Math.max(1, Math.round(requestedOutputSize.height * factor)),
          };
        })()
      : requestedOutputSize;

  return {
    outputSize,
    output: {
      mime,
      quality: mime === 'image/jpeg' || mime === 'image/webp' ? quality.value / 100 : undefined,
      background: mime === 'image/jpeg' ? jpegBackground.value : undefined,
    },
  };
}

async function startProcessing() {
  globalError.value = '';
  globalMessage.value = '';

  if (workspaceBusy.value) {
    globalError.value = '请等待当前文件读取或打包完成。';
    return;
  }
  if (tasks.value.length === 0) {
    globalError.value = '请先添加至少一张图片。';
    return;
  }

  try {
    await processAll(createSpec, { suffix: content.value.suffix });
    const completed = tasks.value.filter((task) => task.status === 'success').length;
    const failed = tasks.value.filter((task) => task.status === 'failed').length;
    globalMessage.value =
      failed > 0
        ? `已完成 ${completed} 张，${failed} 张处理失败，可修正参数后重新处理。`
        : `${completed} 张图片处理完成，可以下载结果。`;
  } catch (error) {
    globalError.value = error instanceof Error ? error.message : '批量处理未能完成。';
  }
}

function downloadTask(task: ImageTask) {
  if (task.result && !workspaceBusy.value) {
    downloadBlob(task.result.blob, task.result.filename);
  }
}

async function downloadAll() {
  if (successTasks.value.length === 0 || workspaceBusy.value) {
    return;
  }

  if (successTasks.value.length === 1) {
    downloadTask(successTasks.value[0]!);
    return;
  }

  if (totalResultBytes.value > maxZipResultBytes) {
    globalError.value =
      '结果总大小超过 256 MB。为避免浏览器打包时内存不足，请单张下载，或分成更小的批次处理。';
    return;
  }

  isPackaging.value = true;
  const controller = new AbortController();
  packagingController = controller;
  globalError.value = '';
  try {
    const zip = await createResultsZip(controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    downloadBlob(zip, `image-studio-${props.mode}-results.zip`);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }
    globalError.value = error instanceof Error ? error.message : '结果打包失败，请尝试单张下载。';
  } finally {
    if (packagingController === controller) {
      packagingController = null;
      isPackaging.value = false;
    }
  }
}

function clearWorkspace() {
  addSequence += 1;
  isAdding.value = false;
  packagingController?.abort();
  packagingController = null;
  isPackaging.value = false;
  clear();
  globalError.value = '';
  globalMessage.value = '';
}

watch(
  () => props.mode,
  () => {
    clearWorkspace();
  },
);

onMounted(async () => {
  try {
    capabilities.value = await detectEncodingCapabilities();
    if (!capabilities.value.webp && convertOutput.value === 'image/webp') {
      convertOutput.value = 'image/jpeg';
    }
  } finally {
    capabilityReady.value = true;
  }

  const handoffFile = takeHandoffFile('image');
  if (handoffFile) {
    await handleFiles([handoffFile]);
  }
});

onBeforeUnmount(() => {
  addSequence += 1;
  packagingController?.abort();
  packagingController = null;
});
</script>

<template>
  <component
    :is="embedded ? 'div' : 'main'"
    id="main-content"
    class="min-h-[calc(100vh-72px)] bg-[var(--page)]"
  >
    <ImageToolHeader
      :title="content.title"
      :description="content.description"
      :icon="content.icon"
    />

    <section class="tool-workbench" aria-label="图片处理工作台">
      <div class="tool-workbench__privacy" role="note">
        <ShieldCheck :size="16" aria-hidden="true" />
        <span>本地处理 · 文件不上传</span>
      </div>
      <div
        v-if="globalError"
        class="mb-5 flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
        role="alert"
      >
        <span class="flex items-start gap-2">
          <AlertTriangle class="mt-0.5 shrink-0" :size="17" aria-hidden="true" />
          {{ globalError }}
        </span>
        <button
          type="button"
          class="grid size-6 shrink-0 place-items-center rounded-md hover:bg-rose-100 dark:hover:bg-rose-900"
          aria-label="关闭错误提示"
          @click="globalError = ''"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </div>

      <div
        v-if="globalMessage"
        class="mb-5 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200"
        role="status"
      >
        <Info class="mt-0.5 shrink-0" :size="17" aria-hidden="true" />
        {{ globalMessage }}
      </div>

      <div v-if="tasks.length === 0" class="grid gap-3">
        <ImageDropzone :disabled="workspaceBusy" @files="handleFiles" />
        <p
          v-if="isAdding"
          class="inline-flex items-center justify-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle class="animate-spin" :size="17" aria-hidden="true" />
          正在安全读取图片，请稍候…
        </p>
      </div>

      <div v-else class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="grid min-w-0 gap-4">
          <div
            class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5"
          >
            <div class="flex flex-wrap items-center gap-3 text-sm">
              <strong class="text-[var(--text)]">{{ tasks.length }} 张图片</strong>
              <span class="text-[var(--text-muted)]">{{ formatBytes(totalOriginalBytes) }}</span>
              <span
                v-if="progressText"
                class="font-medium text-indigo-600 dark:text-indigo-300"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {{ progressText }}
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text-soft)] outline-none transition hover:border-indigo-300 hover:text-indigo-600 focus-visible:ring-4 focus-visible:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-45 dark:focus-visible:ring-indigo-900"
                :disabled="workspaceBusy"
                @click="selectMoreFiles"
              >
                <LoaderCircle v-if="isAdding" class="animate-spin" :size="14" aria-hidden="true" />
                <Plus :size="14" aria-hidden="true" />
                {{ isAdding ? '正在读取…' : '继续添加' }}
              </button>
              <input
                ref="continueInputRef"
                class="sr-only"
                type="file"
                multiple
                tabindex="-1"
                :accept="INPUT_IMAGE_ACCEPT"
                :disabled="workspaceBusy"
                @change="handleMoreFiles"
              />
              <button
                type="button"
                class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-45 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                :disabled="workspaceBusy"
                @click="clearWorkspace"
              >
                <Trash2 :size="14" aria-hidden="true" />
                清空
              </button>
            </div>
          </div>

          <ImageTaskList
            :tasks="tasks"
            :is-processing="isProcessing"
            :controls-disabled="workspaceBusy"
            @remove="handleRemoveTask"
            @download="downloadTask"
          />
        </div>

        <aside class="grid gap-4 xl:sticky xl:top-[92px]" aria-label="图片处理参数">
          <section class="surface-card overflow-hidden">
            <header class="border-b border-[var(--border)] px-5 py-4">
              <div class="flex items-center gap-2">
                <SlidersHorizontal class="text-indigo-600" :size="18" aria-hidden="true" />
                <h2 class="text-sm font-bold text-[var(--text)]">处理参数</h2>
              </div>
            </header>

            <div class="grid gap-5 p-5">
              <template v-if="mode === 'compress'">
                <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                  输出格式
                  <span class="image-select">
                    <select
                      v-model="compressOutput"
                      class="image-select__control"
                      :disabled="workspaceBusy"
                    >
                      <option value="original">保持原格式</option>
                      <option
                        v-for="format in formatOptions"
                        :key="format.mime"
                        :value="format.mime"
                        :disabled="!format.enabled"
                      >
                        {{ format.label }}{{ format.enabled ? '' : '（当前浏览器不支持）' }}
                      </option>
                    </select>
                    <ChevronDown class="image-select__icon" :size="18" aria-hidden="true" />
                  </span>
                </label>
              </template>

              <template v-if="mode === 'convert'">
                <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                  转换为
                  <span class="image-select">
                    <select
                      v-model="convertOutput"
                      class="image-select__control"
                      :disabled="workspaceBusy"
                    >
                      <option
                        v-for="format in formatOptions"
                        :key="format.mime"
                        :value="format.mime"
                        :disabled="!format.enabled"
                      >
                        {{ format.label }}{{ format.enabled ? '' : '（当前浏览器不支持）' }}
                      </option>
                    </select>
                    <ChevronDown class="image-select__icon" :size="18" aria-hidden="true" />
                  </span>
                </label>
              </template>

              <template v-if="mode === 'resize'">
                <div class="grid gap-2">
                  <span class="text-sm font-semibold text-[var(--text)]">调整方式</span>
                  <div class="grid grid-cols-3 rounded-xl bg-[var(--surface-subtle)] p-1">
                    <button
                      v-for="option in [
                        { value: 'fixed', label: '固定尺寸' },
                        { value: 'percent', label: '百分比' },
                        { value: 'max', label: '最大边' },
                      ] as const"
                      :key="option.value"
                      type="button"
                      class="min-h-9 rounded-lg px-2 text-xs font-semibold transition"
                      :class="
                        resizeMode === option.value
                          ? 'bg-[var(--surface)] text-indigo-600 shadow-sm'
                          : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                      "
                      :disabled="workspaceBusy"
                      :aria-pressed="resizeMode === option.value"
                      @click="resizeMode = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <div v-if="resizeMode === 'fixed'" class="grid gap-3">
                  <div class="grid grid-cols-2 gap-3">
                    <label class="grid gap-2 text-xs font-semibold text-[var(--text-soft)]">
                      宽度 px
                      <input
                        v-model.number="targetWidth"
                        class="h-10 min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                        type="number"
                        min="1"
                        :max="maxCanvasEdge"
                        :disabled="workspaceBusy"
                      />
                    </label>
                    <label class="grid gap-2 text-xs font-semibold text-[var(--text-soft)]">
                      高度 px
                      <input
                        v-model.number="targetHeight"
                        class="h-10 min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                        type="number"
                        min="1"
                        :max="maxCanvasEdge"
                        :disabled="workspaceBusy"
                      />
                    </label>
                  </div>
                  <label
                    class="flex items-center gap-2 text-xs font-medium text-[var(--text-soft)]"
                  >
                    <input
                      v-model="keepRatio"
                      class="size-4 rounded border-[var(--border-strong)]"
                      type="checkbox"
                      :disabled="workspaceBusy"
                    />
                    保持原始比例，完整放入目标范围
                  </label>
                </div>

                <label
                  v-else-if="resizeMode === 'percent'"
                  class="grid gap-2 text-sm font-semibold text-[var(--text)]"
                >
                  缩放比例
                  <div class="grid grid-cols-[1fr_82px] items-center gap-3">
                    <input
                      v-model.number="resizePercent"
                      type="range"
                      min="1"
                      max="400"
                      :disabled="workspaceBusy"
                    />
                    <span
                      class="grid h-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] text-sm"
                    >
                      {{ resizePercent }}%
                    </span>
                  </div>
                </label>

                <label v-else class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                  最长边
                  <div class="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      v-model.number="maxEdge"
                      class="h-10 min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                      type="number"
                      min="1"
                      :max="maxCanvasEdge"
                      :disabled="workspaceBusy"
                    />
                    <span
                      class="grid h-10 place-items-center rounded-xl bg-[var(--surface-subtle)] px-3 text-xs font-semibold text-[var(--text-soft)]"
                    >
                      px
                    </span>
                  </div>
                  <div class="grid grid-cols-4 gap-1.5">
                    <button
                      v-for="value in [1920, 1440, 1080, 720]"
                      :key="value"
                      type="button"
                      class="h-8 rounded-lg border border-[var(--border)] text-[11px] font-semibold text-[var(--text-soft)] transition hover:border-indigo-300 hover:text-indigo-600"
                      :disabled="workspaceBusy"
                      @click="maxEdge = value"
                    >
                      {{ value }}
                    </button>
                  </div>
                </label>

                <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                  输出格式
                  <span class="image-select">
                    <select
                      v-model="resizeOutput"
                      class="image-select__control"
                      :disabled="workspaceBusy"
                    >
                      <option value="original">保持原格式</option>
                      <option
                        v-for="format in formatOptions"
                        :key="format.mime"
                        :value="format.mime"
                        :disabled="!format.enabled"
                      >
                        {{ format.label }}{{ format.enabled ? '' : '（当前浏览器不支持）' }}
                      </option>
                    </select>
                    <ChevronDown class="image-select__icon" :size="18" aria-hidden="true" />
                  </span>
                </label>
              </template>

              <div
                v-if="mode === 'convert' && selectedOutput === 'image/vnd.microsoft.icon'"
                class="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs leading-5 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
              >
                <Info class="mt-0.5 shrink-0" :size="15" aria-hidden="true" />
                ICO 使用 PNG 图层封装，保留透明背景，并等比例限制在 256 × 256 px 内。
              </div>

              <div
                v-if="mode === 'convert' && selectedOutput === 'image/svg+xml'"
                class="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs leading-5 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
              >
                <Info class="mt-0.5 shrink-0" :size="15" aria-hidden="true" />
                SVG 会内嵌处理后的 PNG 位图，文件可独立打开，但不会自动把照片矢量化。
              </div>

              <div
                v-if="selectedOutput === 'original'"
                class="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs leading-5 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
              >
                <Info class="mt-0.5 shrink-0" :size="15" aria-hidden="true" />
                JPEG、PNG、WebP 会保持格式；AVIF、BMP、GIF、HEIC/HEIF、ICO、PSD、SVG 与 TIFF 会转为
                PNG。动画图片仅保留当前解码帧。
              </div>

              <label v-if="showQuality" class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                <span class="flex items-center justify-between gap-3">
                  输出质量
                  <b class="text-indigo-600 dark:text-indigo-300">{{ quality }}</b>
                </span>
                <input
                  v-model.number="quality"
                  type="range"
                  min="0"
                  max="100"
                  :disabled="workspaceBusy"
                />
                <span class="text-xs leading-5 font-normal text-[var(--text-muted)]">
                  数值越高画质越好，文件通常也会更大。PNG 不使用此参数。
                </span>
              </label>

              <label
                v-if="selectedOutput === 'image/jpeg'"
                class="grid gap-2 text-sm font-semibold text-[var(--text)]"
              >
                透明区域背景
                <span
                  class="flex h-11 items-center gap-3 rounded-xl border border-[var(--border-strong)] px-3"
                >
                  <input
                    v-model="jpegBackground"
                    class="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    type="color"
                    :disabled="workspaceBusy"
                  />
                  <code class="text-xs text-[var(--text-soft)]">{{ jpegBackground }}</code>
                </span>
              </label>

              <div
                v-if="capabilityReady"
                class="flex items-start gap-2 text-xs leading-5 text-[var(--text-muted)]"
              >
                <CheckCircle2
                  class="mt-0.5 shrink-0 text-emerald-600"
                  :size="15"
                  aria-hidden="true"
                />
                当前浏览器可输出
                {{
                  formatOptions
                    .filter((format) => format.enabled)
                    .map((format) => format.label)
                    .join('、')
                }}
              </div>
            </div>
          </section>

          <section class="surface-card grid gap-3 p-4">
            <button
              v-if="!isProcessing"
              type="button"
              data-testid="process-all"
              class="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-50"
              :disabled="tasks.length === 0 || isAdding || isPackaging"
              @click="startProcessing"
            >
              <LoaderCircle
                v-if="isAdding || isPackaging"
                class="animate-spin"
                :size="17"
                aria-hidden="true"
              />
              <Play v-else :size="17" fill="currentColor" aria-hidden="true" />
              {{ isAdding ? '正在读取图片…' : isPackaging ? '正在打包结果…' : content.action }}
            </button>
            <button
              v-else
              type="button"
              class="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 text-sm font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
              @click="cancel"
            >
              <LoaderCircle class="animate-spin" :size="17" aria-hidden="true" />
              取消处理
            </button>

            <button
              v-if="successTasks.length > 0"
              type="button"
              data-testid="download-all"
              class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-55 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
              :disabled="workspaceBusy"
              @click="downloadAll"
            >
              <FileArchive v-if="successTasks.length > 1" :size="17" aria-hidden="true" />
              <Download v-else :size="17" aria-hidden="true" />
              {{
                isPackaging
                  ? '正在打包…'
                  : successTasks.length > 1
                    ? `打包下载 ${successTasks.length} 张`
                    : '下载处理结果'
              }}
            </button>

            <div
              v-if="successTasks.length > 0"
              class="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]"
            >
              <span>原始 {{ formatBytes(totalOriginalBytes) }}</span>
              <span>结果 {{ formatBytes(totalResultBytes) }}</span>
            </div>

            <button
              v-if="!isProcessing && tasks.some((task) => task.status !== 'ready')"
              type="button"
              class="inline-flex items-center justify-center gap-1.5 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:text-indigo-600"
              :disabled="workspaceBusy"
              @click="resetAll"
            >
              <RotateCcw :size="14" aria-hidden="true" />
              重置任务状态
            </button>
          </section>
        </aside>
      </div>
    </section>
  </component>
</template>
