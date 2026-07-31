<script setup lang="ts">
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  FileImage,
  FileText,
  Info,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "@lucide/vue";
import { computed, onBeforeUnmount, ref } from "vue";

import ImageDropzone from "@/components/upload/ImageDropzone.vue";
import { readImageDimensions } from "@/core/image/dimensions";
import {
  createImagesPdf,
  MAX_PDF_IMAGE_BYTES,
  MAX_PDF_IMAGE_COUNT,
  MAX_PDF_TOTAL_BYTES,
  type PdfImageFit,
  type PdfOrientation,
  type PdfPageSize,
} from "@/core/image/pdf";
import { sanitizeSvgFile } from "@/core/image/process";
import { downloadBlob } from "@/utils/download";
import { formatBytes } from "@/utils/format";

interface PdfImageItem {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

const acceptedExtensions = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "ico",
  "heic",
  "heif",
  "svg",
]);

const items = ref<PdfImageItem[]>([]);
const pageSize = ref<PdfPageSize>("a4");
const orientation = ref<PdfOrientation>("portrait");
const imageFit = ref<PdfImageFit>("fit");
const marginMm = ref(12);
const jpegQuality = ref(90);
const outputName = ref("image-studio");
const isAdding = ref(false);
const isGenerating = ref(false);
const completedPages = ref(0);
const errorMessage = ref("");
const statusMessage = ref("");
const resultBlob = ref<Blob | null>(null);
const moreInputRef = ref<HTMLInputElement | null>(null);
let activeController: AbortController | null = null;
let loadSequence = 0;
let fallbackId = 0;

const totalBytes = computed(() =>
  items.value.reduce((total, item) => total + item.file.size, 0),
);
const busy = computed(() => isAdding.value || isGenerating.value);
const progress = computed(() =>
  items.value.length > 0
    ? Math.round((completedPages.value / items.value.length) * 100)
    : 0,
);
const safeOutputName = computed(() => {
  const trimmed = outputName.value.trim().replace(/\.pdf$/i, "");
  const cleaned = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return `${cleaned || "image-studio"}.pdf`;
});

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  fallbackId += 1;
  return `pdf-image-${Date.now()}-${fallbackId}`;
}

function extension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

function releasePreview(item: PdfImageItem): void {
  URL.revokeObjectURL(item.previewUrl);
}

function clearResult(): void {
  resultBlob.value = null;
  completedPages.value = 0;
  if (!isGenerating.value) {
    statusMessage.value = "";
  }
}

async function addFiles(files: File[]): Promise<void> {
  if (busy.value || files.length === 0) {
    return;
  }

  errorMessage.value = "";
  statusMessage.value = "";
  clearResult();

  const remaining = MAX_PDF_IMAGE_COUNT - items.value.length;
  if (remaining <= 0) {
    errorMessage.value = `一次最多添加 ${MAX_PDF_IMAGE_COUNT} 张图片。`;
    return;
  }

  const sequence = ++loadSequence;
  isAdding.value = true;
  let added = 0;
  let skipped = 0;
  let addedGifCount = 0;
  let workingTotal = totalBytes.value;

  try {
    for (const [inputIndex, originalFile] of files.entries()) {
      if (sequence !== loadSequence) {
        break;
      }
      if (added >= remaining) {
        skipped += files.length - inputIndex;
        break;
      }

      const fileExtension = extension(originalFile.name);
      if (
        originalFile.size === 0 ||
        originalFile.size > MAX_PDF_IMAGE_BYTES ||
        !acceptedExtensions.has(fileExtension) ||
        (originalFile.type && !originalFile.type.startsWith("image/")) ||
        workingTotal + originalFile.size > MAX_PDF_TOTAL_BYTES
      ) {
        skipped += 1;
        continue;
      }

      let file = originalFile;
      let previewUrl = "";
      try {
        if (fileExtension === "svg") {
          file = await sanitizeSvgFile(originalFile);
        }
        const dimensions = await readImageDimensions(file);
        if (sequence !== loadSequence) {
          break;
        }

        previewUrl = URL.createObjectURL(file);
        items.value.push({
          id: createId(),
          file,
          previewUrl,
          width: dimensions.width,
          height: dimensions.height,
        });
        workingTotal += originalFile.size;
        added += 1;
        if (fileExtension === "gif") {
          addedGifCount += 1;
        }
      } catch {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        skipped += 1;
      }
    }

    if (added > 0) {
      statusMessage.value = `已添加 ${added} 张图片${skipped ? `，跳过 ${skipped} 张无效、超限或当前浏览器无法解码的图片` : ""}。${
        addedGifCount > 0 ? " GIF 将使用浏览器当前解码帧。" : ""
      }`;
    } else {
      errorMessage.value =
        "没有可添加的图片。请检查文件格式、50 MB 单张限制和 300 MB 总大小限制。";
    }
  } finally {
    if (sequence === loadSequence) {
      isAdding.value = false;
    }
  }
}

function removeItem(id: string): void {
  if (busy.value) {
    return;
  }
  const index = items.value.findIndex((item) => item.id === id);
  if (index < 0) {
    return;
  }
  const [removed] = items.value.splice(index, 1);
  if (removed) {
    releasePreview(removed);
  }
  clearResult();
}

function moveItem(index: number, direction: -1 | 1): void {
  if (busy.value) {
    return;
  }
  const target = index + direction;
  if (target < 0 || target >= items.value.length) {
    return;
  }
  const [item] = items.value.splice(index, 1);
  if (item) {
    items.value.splice(target, 0, item);
  }
  clearResult();
}

function selectMore(): void {
  if (!busy.value) {
    moreInputRef.value?.click();
  }
}

function handleMoreInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  void addFiles(Array.from(input.files ?? []));
  input.value = "";
}

function clearAll(): void {
  if (busy.value) {
    return;
  }
  loadSequence += 1;
  items.value.forEach(releasePreview);
  items.value = [];
  resultBlob.value = null;
  completedPages.value = 0;
  errorMessage.value = "";
  statusMessage.value = "";
}

function downloadResult(): void {
  if (resultBlob.value) {
    downloadBlob(resultBlob.value, safeOutputName.value);
  }
}

async function generatePdf(): Promise<void> {
  if (busy.value || items.value.length === 0) {
    return;
  }

  errorMessage.value = "";
  statusMessage.value = "";
  resultBlob.value = null;
  completedPages.value = 0;
  const controller = new AbortController();
  activeController = controller;
  isGenerating.value = true;

  try {
    const pdf = await createImagesPdf(
      items.value.map((item) => item.file),
      {
        pageSize: pageSize.value,
        orientation: orientation.value,
        marginMm: marginMm.value,
        imageFit: imageFit.value,
        jpegQuality: jpegQuality.value / 100,
        signal: controller.signal,
        onProgress(completed) {
          completedPages.value = completed;
        },
      },
    );
    if (controller.signal.aborted) {
      return;
    }

    resultBlob.value = pdf;
    statusMessage.value = `PDF 已生成：${items.value.length} 页，${formatBytes(pdf.size)}。`;
    downloadResult();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      statusMessage.value = "已取消 PDF 生成。";
      return;
    }
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "PDF 生成失败，请减少图片数量后重试。";
  } finally {
    if (activeController === controller) {
      activeController = null;
      isGenerating.value = false;
    }
  }
}

function cancelGeneration(): void {
  activeController?.abort();
}

onBeforeUnmount(() => {
  loadSequence += 1;
  activeController?.abort();
  items.value.forEach(releasePreview);
});
</script>

<template>
  <main id="main-content" class="min-h-[calc(100vh-72px)] bg-[var(--page)]">
    <section class="border-b border-[var(--border)] bg-[var(--surface)]">
      <div class="page-container py-10 sm:py-12">
        <RouterLink
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-soft)] transition hover:text-indigo-600"
          to="/#tools"
        >
          <ArrowLeft :size="16" aria-hidden="true" />
          返回全部工具
        </RouterLink>

        <div class="mt-7 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div class="max-w-3xl">
            <span
              class="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
            >
              <Sparkles :size="14" aria-hidden="true" />
              图片转 PDF
            </span>
            <h1
              class="mt-4 text-3xl leading-tight font-black tracking-[-0.035em] text-[var(--text)] sm:text-4xl"
            >
              多张图片，一次整理成 PDF
            </h1>
            <p class="mt-3 max-w-2xl text-base leading-7 text-[var(--text-soft)]">
              按列表顺序每张生成一页，支持常用纸张或原图自适应页面、横竖方向、适配方式和页边距。图片只在当前浏览器中处理。
            </p>
          </div>
          <div
            class="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-soft)]"
          >
            <span
              class="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5"
            >
              <LockKeyhole :size="14" aria-hidden="true" />
              本地生成
            </span>
            <span
              class="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5"
            >
              <ShieldCheck :size="14" aria-hidden="true" />
              图片不上传
            </span>
          </div>
        </div>
      </div>
    </section>

    <section class="page-container py-8 sm:py-10" aria-label="图片转 PDF 工作台">
      <div
        v-if="errorMessage"
        class="mb-5 flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
        role="alert"
      >
        <span class="flex items-start gap-2">
          <X class="mt-0.5 shrink-0" :size="17" aria-hidden="true" />
          {{ errorMessage }}
        </span>
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
        v-if="statusMessage"
        class="mb-5 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200"
        role="status"
        aria-live="polite"
      >
        <Info class="mt-0.5 shrink-0" :size="17" aria-hidden="true" />
        {{ statusMessage }}
      </div>

      <div v-if="items.length === 0" class="grid gap-3">
        <ImageDropzone
          :disabled="busy"
          @files="(files) => addFiles(files)"
        />
        <p class="text-center text-xs leading-5 text-[var(--text-muted)]">
          此工具一次最多 40 张、单张不超过 50 MB，总大小不超过 300 MB。
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

      <div
        v-else
        class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
      >
        <div class="grid min-w-0 gap-4">
          <div
            class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5"
          >
            <div class="flex flex-wrap items-center gap-3 text-sm">
              <strong class="text-[var(--text)]">{{ items.length }} 张图片</strong>
              <span class="text-[var(--text-muted)]">{{ formatBytes(totalBytes) }}</span>
              <span class="text-[var(--text-muted)]">按当前列表顺序生成</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text-soft)] transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-45"
                :disabled="busy || items.length >= MAX_PDF_IMAGE_COUNT"
                @click="selectMore"
              >
                <Plus :size="14" aria-hidden="true" />
                继续添加
              </button>
              <input
                ref="moreInputRef"
                class="sr-only"
                type="file"
                multiple
                tabindex="-1"
                accept="image/*,.ico,.heic,.heif,.tif,.tiff,.svg"
                :disabled="busy"
                @change="handleMoreInput"
              />
              <button
                type="button"
                class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-45 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                :disabled="busy"
                @click="clearAll"
              >
                <Trash2 :size="14" aria-hidden="true" />
                清空
              </button>
            </div>
          </div>

          <ol class="grid gap-3" aria-label="PDF 图片页顺序">
            <li
              v-for="(item, index) in items"
              :key="item.id"
              class="surface-card grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 p-3.5"
            >
              <div
                class="checkerboard relative grid aspect-square overflow-hidden rounded-xl border border-[var(--border)]"
              >
                <img
                  :src="item.previewUrl"
                  :alt="`${item.file.name} 预览`"
                  class="h-full w-full object-contain"
                />
                <span
                  class="absolute top-1.5 left-1.5 grid min-w-6 place-items-center rounded-md bg-slate-950/75 px-1.5 py-1 text-[10px] font-bold text-white"
                  aria-hidden="true"
                >
                  {{ index + 1 }}
                </span>
              </div>

              <div class="min-w-0">
                <strong
                  class="block truncate text-sm font-semibold text-[var(--text)]"
                  :title="item.file.name"
                >
                  {{ item.file.name }}
                </strong>
                <span class="mt-1 block text-xs text-[var(--text-muted)]">
                  {{ item.width }} × {{ item.height }} px ·
                  {{ formatBytes(item.file.size) }}
                </span>
              </div>

              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="grid size-9 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-subtle)] hover:text-indigo-600 disabled:opacity-30"
                  :disabled="busy || index === 0"
                  :aria-label="`将 ${item.file.name} 上移一页`"
                  @click="moveItem(index, -1)"
                >
                  <ChevronUp :size="17" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="grid size-9 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-subtle)] hover:text-indigo-600 disabled:opacity-30"
                  :disabled="busy || index === items.length - 1"
                  :aria-label="`将 ${item.file.name} 下移一页`"
                  @click="moveItem(index, 1)"
                >
                  <ChevronDown :size="17" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="grid size-9 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                  :disabled="busy"
                  :aria-label="`移除 ${item.file.name}`"
                  @click="removeItem(item.id)"
                >
                  <Trash2 :size="16" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ol>
        </div>

        <aside
          class="grid gap-4 xl:sticky xl:top-[92px]"
          aria-label="PDF 生成参数"
        >
          <section class="surface-card overflow-hidden">
            <header class="border-b border-[var(--border)] px-5 py-4">
              <div class="flex items-center gap-2">
                <SlidersHorizontal
                  class="text-indigo-600"
                  :size="18"
                  aria-hidden="true"
                />
                <h2 class="text-sm font-bold text-[var(--text)]">页面设置</h2>
              </div>
            </header>

            <div class="grid gap-5 p-5">
              <fieldset class="grid gap-2">
                <legend class="text-sm font-semibold text-[var(--text)]">
                  页面尺寸
                </legend>
                <div class="grid grid-cols-3 gap-2">
                  <label
                    v-for="option in [
                      { value: 'a3', label: 'A3' },
                      { value: 'a4', label: 'A4' },
                      { value: 'a5', label: 'A5' },
                      { value: 'letter', label: 'Letter' },
                      { value: 'adaptive', label: '原图自适应' },
                    ]"
                    :key="option.value"
                    class="cursor-pointer rounded-xl border px-2 py-2.5 text-center text-xs font-semibold transition focus-within:ring-4 focus-within:ring-indigo-200 dark:focus-within:ring-indigo-900"
                    :class="[
                      option.value === 'adaptive' ? 'col-span-2' : '',
                      pageSize === option.value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'border-[var(--border)] text-[var(--text-soft)] hover:border-indigo-300',
                    ]"
                  >
                    <input
                      v-model="pageSize"
                      class="sr-only"
                      type="radio"
                      :value="option.value"
                      :disabled="busy"
                      @change="clearResult"
                    />
                    {{ option.label }}
                  </label>
                </div>
              </fieldset>

              <fieldset class="grid gap-2">
                <legend class="text-sm font-semibold text-[var(--text)]">
                  图片适配
                </legend>
                <div class="grid grid-cols-3 gap-2">
                  <label
                    v-for="option in [
                      { value: 'fit', label: '适应' },
                      { value: 'fill', label: '填充' },
                      { value: 'original', label: '原始大小' },
                    ]"
                    :key="option.value"
                    class="cursor-pointer rounded-xl border px-2 py-2.5 text-center text-xs font-semibold transition focus-within:ring-4 focus-within:ring-indigo-200 dark:focus-within:ring-indigo-900"
                    :class="
                      imageFit === option.value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'border-[var(--border)] text-[var(--text-soft)] hover:border-indigo-300'
                    "
                  >
                    <input
                      v-model="imageFit"
                      class="sr-only"
                      type="radio"
                      :value="option.value"
                      :disabled="busy"
                      @change="clearResult"
                    />
                    {{ option.label }}
                  </label>
                </div>
                <p class="text-xs leading-5 font-normal text-[var(--text-muted)]">
                  “填充”可能裁掉边缘；“原始大小”按 96 PPI 放置，超出可用区域时会裁切。
                </p>
              </fieldset>

              <fieldset class="grid gap-2">
                <legend class="text-sm font-semibold text-[var(--text)]">
                  页面方向
                </legend>
                <div class="grid grid-cols-2 gap-2">
                  <label
                    v-for="option in [
                      { value: 'portrait', label: '竖向' },
                      { value: 'landscape', label: '横向' },
                    ]"
                    :key="option.value"
                    class="cursor-pointer rounded-xl border px-3 py-2.5 text-center text-sm font-semibold transition focus-within:ring-4 focus-within:ring-indigo-200 dark:focus-within:ring-indigo-900"
                    :class="
                      orientation === option.value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'border-[var(--border)] text-[var(--text-soft)] hover:border-indigo-300'
                    "
                  >
                    <input
                      v-model="orientation"
                      class="sr-only"
                      type="radio"
                      :value="option.value"
                      :disabled="busy"
                      @change="clearResult"
                    />
                    {{ option.label }}
                  </label>
                </div>
              </fieldset>

              <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                <span class="flex items-center justify-between gap-3">
                  页边距
                  <span class="text-xs font-medium text-[var(--text-muted)]">
                    {{ marginMm }} mm
                  </span>
                </span>
                <input
                  v-model.number="marginMm"
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  :disabled="busy"
                  aria-label="PDF 页边距"
                  @input="clearResult"
                />
              </label>

              <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                <span class="flex items-center justify-between gap-3">
                  图片质量
                  <span class="text-xs font-medium text-[var(--text-muted)]">
                    {{ jpegQuality }}%
                  </span>
                </span>
                <input
                  v-model.number="jpegQuality"
                  type="range"
                  min="60"
                  max="100"
                  step="1"
                  :disabled="busy"
                  aria-label="PDF 内嵌图片质量"
                  @input="clearResult"
                />
              </label>

              <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                文件名
                <input
                  v-model="outputName"
                  type="text"
                  maxlength="120"
                  class="h-11 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] outline-none focus:border-indigo-500"
                  :disabled="busy"
                  aria-describedby="pdf-filename-extension"
                />
                <span
                  id="pdf-filename-extension"
                  class="text-xs font-normal text-[var(--text-muted)]"
                >
                  下载时自动添加 .pdf
                </span>
              </label>
            </div>
          </section>

          <section class="surface-card p-5">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="text-[var(--text-soft)]">预计页数</span>
              <strong class="text-[var(--text)]">{{ items.length }} 页</strong>
            </div>
            <div
              v-if="isGenerating"
              class="mt-4"
              role="progressbar"
              aria-label="PDF 生成进度"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="progress"
            >
              <div class="h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                <div
                  class="h-full rounded-full bg-indigo-600 transition-[width]"
                  :style="{ width: `${progress}%` }"
                />
              </div>
              <p class="mt-2 text-xs text-[var(--text-muted)]">
                已处理 {{ completedPages }} / {{ items.length }} 页
              </p>
            </div>

            <button
              v-if="!isGenerating"
              type="button"
              class="primary-action mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="busy || items.length === 0"
              @click="generatePdf"
            >
              <FileText :size="18" aria-hidden="true" />
              生成并下载 PDF
            </button>
            <button
              v-else
              type="button"
              class="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
              @click="cancelGeneration"
            >
              <X :size="18" aria-hidden="true" />
              取消生成
            </button>

            <button
              v-if="resultBlob"
              type="button"
              class="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
              @click="downloadResult"
            >
              <Download :size="17" aria-hidden="true" />
              再次下载 · {{ formatBytes(resultBlob.size) }}
            </button>
          </section>
        </aside>
      </div>
    </section>

    <section class="border-t border-[var(--border)] bg-[var(--surface)]">
      <div class="page-container grid gap-8 py-12 lg:grid-cols-2">
        <article>
          <div class="flex items-center gap-2 text-indigo-600 dark:text-indigo-300">
            <FileImage :size="19" aria-hidden="true" />
            <h2 class="text-base font-bold">如何生成</h2>
          </div>
          <ol class="mt-4 grid gap-3 text-sm leading-6 text-[var(--text-soft)]">
            <li>1. 添加最多 40 张本地图片，并用上下按钮调整页面顺序。</li>
            <li>2. 选择常用纸张或原图自适应页面，再设置方向、适配、边距和质量。</li>
            <li>3. 生成完成后会自动下载，也可点击“再次下载”。</li>
          </ol>
        </article>
        <article>
          <div class="flex items-center gap-2 text-indigo-600 dark:text-indigo-300">
            <ShieldCheck :size="19" aria-hidden="true" />
            <h2 class="text-base font-bold">本地处理说明</h2>
          </div>
          <p class="mt-4 text-sm leading-6 text-[var(--text-soft)]">
            图片会在 Canvas 中统一为 JPEG 后写入 PDF，每张一页并等比居中。透明区域会使用白色背景，动态图片只保留当前解码帧；文件不会上传到服务器。
            为控制浏览器内存占用，超大图片写入前会等比缩小到最长边 4096 px。
          </p>
          <button
            v-if="items.length > 0 && !busy"
            type="button"
            class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-muted)] transition hover:text-indigo-600"
            @click="clearAll"
          >
            <RotateCcw :size="15" aria-hidden="true" />
            清空并重新开始
          </button>
        </article>
      </div>
    </section>
  </main>
</template>
