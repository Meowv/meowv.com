<script setup lang="ts">
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Info,
  LoaderCircle,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import ImageDropzone from "@/components/upload/ImageDropzone.vue";
import {
  addImagePadding,
  addImageWatermark,
  addRoundedCorners,
  addTextWatermark,
  type CornerRadii,
  type CornerRadiusUnit,
  type EffectOutputMime,
  type EffectResult,
  type ImageEffectMode,
  type ImagePadding,
  type WatermarkPosition,
} from "@/core/image/effects";
import { readImageDimensions } from "@/core/image/dimensions";
import {
  detectEncodingCapabilities,
  detectImageMime,
  getOutputFilename,
  sanitizeSvgFile,
} from "@/core/image";
import type { ImageDimensions } from "@/types/image";
import { downloadBlob } from "@/utils/download";
import { formatBytes } from "@/utils/format";

const props = defineProps<{
  mode: ImageEffectMode;
}>();

const contentByMode = {
  watermark: {
    eyebrow: "添加图片水印",
    title: "留下标识，不交出原图",
    description:
      "添加文字或 Logo 水印，设置位置、大小、透明度、旋转与平铺，在浏览器本地生成结果。",
    action: "生成水印图片",
    suffix: "-watermarked",
    guide: [
      "选择一张需要添加水印的本地图片。",
      "选择文字或 Logo 水印，并调整位置、大小、透明度与平铺方式。",
      "选择输出格式后生成预览。",
      "确认效果并下载新图片，原图不会被修改。",
    ],
    faq: {
      question: "水印内容会发送到服务器吗？",
      answer:
        "不会。文字和图片只在当前浏览器的 Canvas 中合成，页面不会上传原图或水印内容。",
    },
  },
  rounded: {
    eyebrow: "添加图片圆角",
    title: "柔和边缘，一步完成",
    description:
      "自由设置圆角半径。PNG 与 WebP 可保留透明圆角，JPEG 会使用所选背景色填充。",
    action: "生成圆角图片",
    suffix: "-rounded",
    guide: [
      "选择一张需要添加圆角的本地图片。",
      "使用像素或百分比设置统一圆角，也可分别调整四个角。",
      "需要透明圆角时选择 PNG 或 WebP。",
      "生成预览并下载，不会覆盖原始文件。",
    ],
    faq: {
      question: "为什么 JPEG 的四角不是透明的？",
      answer:
        "JPEG 不支持透明通道，因此四角会使用导出设置中的背景颜色填充；需要透明效果请选择 PNG 或 WebP。",
    },
  },
  padding: {
    eyebrow: "补边留白",
    title: "给画面多一点呼吸空间",
    description:
      "统一设置四周留白，或分别调整上、右、下、左边距，并选择纯色、渐变或透明背景。",
    action: "生成补边图片",
    suffix: "-padded",
    guide: [
      "选择一张需要补边的本地图片。",
      "使用统一边距，或开启四边独立设置。",
      "选择纯色、渐变或透明留白与输出格式。",
      "生成后核对新尺寸，再下载结果。",
    ],
    faq: {
      question: "补边会拉伸原图吗？",
      answer:
        "不会。原图会保持原始尺寸，只在画布四周增加指定像素的留白区域，背景可选纯色、渐变或透明。",
    },
  },
} as const;

const positionOptions: Array<{
  value: WatermarkPosition;
  label: string;
}> = [
  { value: "top-left", label: "左上" },
  { value: "top-center", label: "顶部居中" },
  { value: "top-right", label: "右上" },
  { value: "center-left", label: "左侧居中" },
  { value: "center", label: "正中" },
  { value: "center-right", label: "右侧居中" },
  { value: "bottom-left", label: "左下" },
  { value: "bottom-center", label: "底部居中" },
  { value: "bottom-right", label: "右下" },
];

const maxFileBytes = 50 * 1024 * 1024;
const sourceFile = ref<File | null>(null);
const sourceDimensions = ref<ImageDimensions | null>(null);
const sourceUrl = ref("");
const logoInputRef = ref<HTMLInputElement | null>(null);
const logoFile = ref<File | null>(null);
const logoUrl = ref("");
const result = ref<EffectResult | null>(null);
const resultUrl = ref("");
const isReading = ref(false);
const isLogoReading = ref(false);
const isProcessing = ref(false);
const errorMessage = ref("");
const statusMessage = ref("");
const capabilityReady = ref(false);
const webpSupported = ref(false);
let loadSequence = 0;
let logoSequence = 0;
let processController: AbortController | null = null;

const outputMime = ref<EffectOutputMime>("image/png");
const quality = ref(90);
const jpegBackground = ref("#ffffff");

const watermarkText = ref("Image Studio");
const watermarkKind = ref<"text" | "logo">("text");
const watermarkPosition = ref<WatermarkPosition>("bottom-right");
const watermarkFontSize = ref(48);
const watermarkLogoSize = ref(22);
const watermarkColor = ref("#ffffff");
const watermarkOpacity = ref(72);
const watermarkMargin = ref(24);
const watermarkRotation = ref(0);
const watermarkTiled = ref(false);
const watermarkTileGap = ref(72);

const cornerRadius = ref(48);
const cornerUnit = ref<CornerRadiusUnit>("px");
const useUniformCorners = ref(true);
const cornerTopLeft = ref(48);
const cornerTopRight = ref(48);
const cornerBottomRight = ref(48);
const cornerBottomLeft = ref(48);

const useUniformPadding = ref(true);
const uniformPadding = ref(48);
const paddingTop = ref(48);
const paddingRight = ref(48);
const paddingBottom = ref(48);
const paddingLeft = ref(48);
const paddingBackground = ref("#ffffff");
const paddingGradientEnd = ref("#e0e7ff");
const paddingGradientDirection = ref<"horizontal" | "vertical">("horizontal");
const paddingBackgroundOpacity = ref(100);
const paddingBackgroundMode = ref<"solid" | "gradient" | "transparent">(
  "solid",
);

const content = computed(() => contentByMode[props.mode]);
const busy = computed(
  () => isReading.value || isLogoReading.value || isProcessing.value,
);
const qualityEnabled = computed(
  () => outputMime.value === "image/jpeg" || outputMime.value === "image/webp",
);
const cornerRadiusMax = computed(() => {
  if (cornerUnit.value === "percent") {
    return 50;
  }
  const dimensions = sourceDimensions.value;
  return dimensions
    ? Math.max(1, Math.floor(Math.min(dimensions.width, dimensions.height) / 2))
    : 1000;
});
const activePadding = computed<ImagePadding>(() => {
  const normalize = (value: number) =>
    Math.max(0, Math.min(4096, Math.round(Number(value) || 0)));
  if (useUniformPadding.value) {
    const value = normalize(uniformPadding.value);
    return { top: value, right: value, bottom: value, left: value };
  }

  return {
    top: normalize(paddingTop.value),
    right: normalize(paddingRight.value),
    bottom: normalize(paddingBottom.value),
    left: normalize(paddingLeft.value),
  };
});
const pendingDimensions = computed<ImageDimensions | null>(() => {
  const dimensions = sourceDimensions.value;
  if (!dimensions || props.mode !== "padding") {
    return dimensions;
  }

  return {
    width:
      dimensions.width + activePadding.value.left + activePadding.value.right,
    height:
      dimensions.height + activePadding.value.top + activePadding.value.bottom,
  };
});
const outputOptions = computed<
  Array<{ value: EffectOutputMime; label: string; enabled: boolean }>
>(() => [
  { value: "image/png", label: "PNG", enabled: true },
  { value: "image/jpeg", label: "JPEG", enabled: true },
  {
    value: "image/webp",
    label: "WebP",
    enabled: capabilityReady.value && webpSupported.value,
  },
]);

function releaseSourceUrl(): void {
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value);
    sourceUrl.value = "";
  }
}

function releaseResultUrl(): void {
  if (resultUrl.value) {
    URL.revokeObjectURL(resultUrl.value);
    resultUrl.value = "";
  }
}

function releaseLogoUrl(): void {
  if (logoUrl.value) {
    URL.revokeObjectURL(logoUrl.value);
    logoUrl.value = "";
  }
}

function clearResult(): void {
  releaseResultUrl();
  result.value = null;
  statusMessage.value = "";
}

function clearWorkspace(): void {
  loadSequence += 1;
  processController?.abort();
  processController = null;
  isReading.value = false;
  isProcessing.value = false;
  releaseSourceUrl();
  clearResult();
  sourceFile.value = null;
  sourceDimensions.value = null;
  errorMessage.value = "";
}

async function selectLogo(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || busy.value) {
    return;
  }

  errorMessage.value = "";
  if (file.size === 0 || file.size > 20 * 1024 * 1024) {
    errorMessage.value =
      file.size === 0
        ? "Logo 文件没有内容，请选择有效图片。"
        : "Logo 图片不能超过 20 MB。";
    return;
  }

  const sequence = ++logoSequence;
  isLogoReading.value = true;
  let nextUrl = "";
  try {
    const detectedMime = await detectImageMime(file);
    if (!detectedMime) {
      throw new TypeError("无法识别 Logo 图片格式");
    }
    const preparedFile =
      detectedMime === "image/svg+xml" ? await sanitizeSvgFile(file) : file;
    await readImageDimensions(preparedFile);
    nextUrl = URL.createObjectURL(preparedFile);

    if (sequence !== logoSequence) {
      URL.revokeObjectURL(nextUrl);
      return;
    }
    releaseLogoUrl();
    logoFile.value = preparedFile;
    logoUrl.value = nextUrl;
    clearResult();
  } catch {
    if (nextUrl) {
      URL.revokeObjectURL(nextUrl);
    }
    if (sequence !== logoSequence) {
      return;
    }
    errorMessage.value =
      "无法读取 Logo 图片。文件可能已损坏，或格式不受当前浏览器支持。";
  } finally {
    if (sequence === logoSequence) {
      isLogoReading.value = false;
    }
  }
}

function clearLogo(): void {
  logoSequence += 1;
  isLogoReading.value = false;
  releaseLogoUrl();
  logoFile.value = null;
  clearResult();
}

async function selectSource(files: File[]): Promise<void> {
  const file = files[0];
  if (!file || busy.value) {
    return;
  }

  errorMessage.value = "";
  statusMessage.value = "";
  if (file.size === 0) {
    errorMessage.value = "这个文件没有内容，请选择有效的图片。";
    return;
  }
  if (file.size > maxFileBytes) {
    errorMessage.value = `图片超过 ${formatBytes(maxFileBytes)}，请先缩小文件后再试。`;
    return;
  }

  const sequence = ++loadSequence;
  isReading.value = true;
  processController?.abort();
  let nextUrl = "";

  try {
    const detectedMime = await detectImageMime(file);
    if (!detectedMime) {
      throw new TypeError("无法识别图片格式");
    }
    const preparedFile =
      detectedMime === "image/svg+xml" ? await sanitizeSvgFile(file) : file;
    const dimensions = await readImageDimensions(preparedFile);
    nextUrl = URL.createObjectURL(preparedFile);

    if (sequence !== loadSequence) {
      URL.revokeObjectURL(nextUrl);
      return;
    }

    releaseSourceUrl();
    clearResult();
    sourceFile.value = preparedFile;
    sourceDimensions.value = dimensions;
    sourceUrl.value = nextUrl;
    cornerRadius.value = Math.min(
      cornerRadius.value,
      Math.floor(Math.min(dimensions.width, dimensions.height) / 2),
    );
    if (files.length > 1) {
      statusMessage.value = "当前工具一次处理一张图片，已载入第一张。";
    }
  } catch (error) {
    if (nextUrl) {
      URL.revokeObjectURL(nextUrl);
    }
    if (sequence !== loadSequence) {
      return;
    }

    errorMessage.value =
      error instanceof RangeError && error.message === "IMAGE_TOO_LARGE"
        ? "图片像素尺寸过大（最长边限 32768 px、总像素限 5000 万），为避免浏览器内存不足，未载入该文件。"
        : "无法读取这张图片。文件可能已损坏，或格式不受当前浏览器支持。";
  } finally {
    if (sequence === loadSequence) {
      isReading.value = false;
    }
  }
}

function outputSettings() {
  return {
    mime: outputMime.value,
    quality: qualityEnabled.value ? quality.value / 100 : undefined,
    background:
      outputMime.value === "image/jpeg" ? jpegBackground.value : undefined,
  };
}

async function processCurrentImage(): Promise<void> {
  if (!sourceFile.value || busy.value) {
    if (!sourceFile.value) {
      errorMessage.value = "请先选择一张图片。";
    }
    return;
  }

  errorMessage.value = "";
  statusMessage.value = "";
  clearResult();
  const controller = new AbortController();
  processController = controller;
  isProcessing.value = true;

  try {
    let nextResult: EffectResult;
    if (props.mode === "watermark") {
      const commonWatermarkOptions = {
        position: watermarkPosition.value,
        opacity: watermarkOpacity.value / 100,
        margin: Math.round(watermarkMargin.value),
        rotation: watermarkRotation.value,
        tiled: watermarkTiled.value,
        tileGap: Math.round(watermarkTileGap.value),
        output: outputSettings(),
      };
      if (watermarkKind.value === "logo") {
        if (!logoFile.value) {
          throw new TypeError("请先选择一张 Logo 图片。");
        }
        nextResult = await addImageWatermark(
          sourceFile.value,
          {
            ...commonWatermarkOptions,
            logo: logoFile.value,
            sizePercent: watermarkLogoSize.value,
          },
          controller.signal,
        );
      } else {
        nextResult = await addTextWatermark(
          sourceFile.value,
          {
            ...commonWatermarkOptions,
            text: watermarkText.value,
            fontSize: Math.round(watermarkFontSize.value),
            color: watermarkColor.value,
          },
          controller.signal,
        );
      }
    } else if (props.mode === "rounded") {
      const normalizeCorner = (value: number) =>
        Math.max(
          0,
          Math.min(cornerRadiusMax.value, Math.round(Number(value) || 0)),
        );
      const radius: number | CornerRadii = useUniformCorners.value
        ? normalizeCorner(cornerRadius.value)
        : {
            topLeft: normalizeCorner(cornerTopLeft.value),
            topRight: normalizeCorner(cornerTopRight.value),
            bottomRight: normalizeCorner(cornerBottomRight.value),
            bottomLeft: normalizeCorner(cornerBottomLeft.value),
          };
      nextResult = await addRoundedCorners(
        sourceFile.value,
        {
          radius,
          unit: cornerUnit.value,
          output: outputSettings(),
        },
        controller.signal,
      );
    } else {
      nextResult = await addImagePadding(
        sourceFile.value,
        {
          padding: activePadding.value,
          background:
            paddingBackgroundMode.value === "transparent"
              ? null
              : paddingBackgroundMode.value === "gradient"
                ? {
                    type: "linear-gradient",
                    startColor: paddingBackground.value,
                    endColor: paddingGradientEnd.value,
                    direction: paddingGradientDirection.value,
                    opacity: paddingBackgroundOpacity.value / 100,
                  }
                : {
                    type: "solid",
                    color: paddingBackground.value,
                    opacity: paddingBackgroundOpacity.value / 100,
                  },
          output: outputSettings(),
        },
        controller.signal,
      );
    }

    if (controller.signal.aborted) {
      return;
    }
    result.value = nextResult;
    resultUrl.value = URL.createObjectURL(nextResult.blob);
    statusMessage.value = "图片已在本地生成，可以预览并下载。";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "图片处理失败，请检查参数后重试。";
  } finally {
    if (processController === controller) {
      processController = null;
      isProcessing.value = false;
    }
  }
}

function cancelProcessing(): void {
  processController?.abort();
  processController = null;
  isProcessing.value = false;
  statusMessage.value = "已取消本次处理。";
}

function downloadResult(): void {
  if (!sourceFile.value || !result.value || isProcessing.value) {
    return;
  }
  downloadBlob(
    result.value.blob,
    getOutputFilename(
      sourceFile.value.name,
      result.value.mime,
      content.value.suffix,
    ),
  );
}

watch(
  () => props.mode,
  () => {
    logoSequence += 1;
    isLogoReading.value = false;
    processController?.abort();
    processController = null;
    isProcessing.value = false;
    clearResult();
    errorMessage.value = "";
  },
);

watch(cornerUnit, () => {
  const clamp = (value: number) =>
    Math.max(0, Math.min(cornerRadiusMax.value, Math.round(value)));
  cornerRadius.value = clamp(cornerRadius.value);
  cornerTopLeft.value = clamp(cornerTopLeft.value);
  cornerTopRight.value = clamp(cornerTopRight.value);
  cornerBottomRight.value = clamp(cornerBottomRight.value);
  cornerBottomLeft.value = clamp(cornerBottomLeft.value);
});

watch(
  [
    outputMime,
    quality,
    jpegBackground,
    watermarkKind,
    watermarkText,
    watermarkPosition,
    watermarkFontSize,
    watermarkLogoSize,
    watermarkColor,
    watermarkOpacity,
    watermarkMargin,
    watermarkRotation,
    watermarkTiled,
    watermarkTileGap,
    logoFile,
    cornerRadius,
    cornerUnit,
    useUniformCorners,
    cornerTopLeft,
    cornerTopRight,
    cornerBottomRight,
    cornerBottomLeft,
    useUniformPadding,
    uniformPadding,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    paddingBackground,
    paddingGradientEnd,
    paddingGradientDirection,
    paddingBackgroundOpacity,
    paddingBackgroundMode,
  ],
  () => {
    if (result.value) {
      clearResult();
    }
  },
);

onMounted(async () => {
  try {
    const capabilities = await detectEncodingCapabilities();
    webpSupported.value = capabilities.webp;
  } finally {
    capabilityReady.value = true;
  }
});

onBeforeUnmount(() => {
  loadSequence += 1;
  logoSequence += 1;
  processController?.abort();
  releaseSourceUrl();
  releaseResultUrl();
  releaseLogoUrl();
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
              {{ content.eyebrow }}
            </span>
            <h1
              class="mt-4 text-3xl leading-tight font-black tracking-[-0.035em] text-[var(--text)] sm:text-4xl"
            >
              {{ content.title }}
            </h1>
            <p
              class="mt-3 max-w-2xl text-base leading-7 text-[var(--text-soft)]"
            >
              {{ content.description }}
            </p>
          </div>
          <div
            class="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-soft)]"
          >
            <span
              class="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5"
            >
              <LockKeyhole :size="14" aria-hidden="true" />
              本地处理
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

    <section
      class="page-container py-8 sm:py-10"
      :aria-label="`${content.eyebrow}工作台`"
    >
      <div
        v-if="errorMessage"
        class="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
        role="alert"
      >
        {{ errorMessage }}
      </div>
      <div
        v-if="statusMessage"
        class="mb-5 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200"
        role="status"
      >
        <Info class="mt-1 shrink-0" :size="16" aria-hidden="true" />
        {{ statusMessage }}
      </div>

      <ImageDropzone
        v-if="!sourceFile"
        :disabled="busy"
        :multiple="false"
        @files="selectSource"
      />

      <div v-else class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="grid min-w-0 gap-6">
          <section class="surface-card overflow-hidden">
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"
            >
              <div>
                <h2 class="font-bold text-[var(--text)]">原图预览</h2>
                <p
                  v-if="sourceDimensions"
                  class="mt-1 text-xs text-[var(--text-muted)]"
                >
                  {{ sourceDimensions.width }} ×
                  {{ sourceDimensions.height }} px ·
                  {{ formatBytes(sourceFile.size) }}
                </p>
              </div>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-soft)] transition hover:border-rose-300 hover:text-rose-600"
                :disabled="busy"
                @click="clearWorkspace"
              >
                <Trash2 :size="16" aria-hidden="true" />
                移除图片
              </button>
            </div>
            <div
              class="checkerboard grid min-h-[360px] place-items-center overflow-hidden p-5 sm:min-h-[500px]"
            >
              <img
                :src="sourceUrl"
                :alt="`${sourceFile.name} 原图预览`"
                class="max-h-[620px] w-auto rounded-lg object-contain shadow-lg"
              />
            </div>
          </section>

          <section
            v-if="result && resultUrl"
            class="surface-card overflow-hidden"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"
            >
              <div>
                <div class="flex items-center gap-2">
                  <CheckCircle2
                    class="text-emerald-600 dark:text-emerald-400"
                    :size="18"
                    aria-hidden="true"
                  />
                  <h2 class="font-bold text-[var(--text)]">处理结果</h2>
                </div>
                <p class="mt-1 text-xs text-[var(--text-muted)]">
                  {{ result.width }} × {{ result.height }} px ·
                  {{ formatBytes(result.blob.size) }}
                </p>
              </div>
              <button
                type="button"
                class="primary-action inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold shadow-sm transition hover:bg-indigo-700"
                @click="downloadResult"
              >
                <Download :size="17" aria-hidden="true" />
                下载图片
              </button>
            </div>
            <div
              class="checkerboard grid min-h-[360px] place-items-center overflow-hidden p-5"
            >
              <img
                :src="resultUrl"
                alt="处理结果预览"
                class="max-h-[620px] w-auto object-contain shadow-lg"
              />
            </div>
          </section>
        </div>

        <aside class="grid content-start gap-4" aria-label="处理参数">
          <ImageDropzone
            compact
            :disabled="busy"
            :multiple="false"
            @files="selectSource"
          />

          <section
            v-if="mode === 'watermark'"
            class="surface-card p-5"
            aria-labelledby="watermark-settings"
          >
            <h2 id="watermark-settings" class="font-bold text-[var(--text)]">
              水印设置
            </h2>

            <div
              class="mt-5 grid grid-cols-2 rounded-xl bg-[var(--surface-subtle)] p-1"
              aria-label="水印类型"
            >
              <button
                v-for="option in [
                  { value: 'text', label: '文字水印' },
                  { value: 'logo', label: 'Logo 水印' },
                ]"
                :key="option.value"
                type="button"
                class="rounded-lg px-3 py-2 text-sm font-bold transition"
                :class="
                  watermarkKind === option.value
                    ? 'bg-[var(--surface)] text-indigo-700 shadow-sm dark:text-indigo-300'
                    : 'text-[var(--text-muted)]'
                "
                :aria-pressed="watermarkKind === option.value"
                @click="watermarkKind = option.value as 'text' | 'logo'"
              >
                {{ option.label }}
              </button>
            </div>

            <label v-if="watermarkKind === 'text'" class="mt-5 block">
              <span class="text-sm font-semibold text-[var(--text-soft)]">
                水印文字
              </span>
              <textarea
                v-model="watermarkText"
                class="mt-2 min-h-24 w-full resize-y rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-3 text-sm leading-6 text-[var(--text)]"
                maxlength="500"
                placeholder="输入水印文字"
              />
            </label>

            <div v-else class="mt-5">
              <span class="text-sm font-semibold text-[var(--text-soft)]">
                Logo 图片
              </span>
              <div
                v-if="logoFile && logoUrl"
                class="mt-2 flex items-center gap-3 rounded-xl border border-[var(--border)] p-3"
              >
                <div
                  class="checkerboard grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg"
                >
                  <img
                    :src="logoUrl"
                    alt="Logo 水印预览"
                    class="max-h-12 max-w-12 object-contain"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <strong
                    class="block truncate text-sm font-semibold text-[var(--text)]"
                  >
                    {{ logoFile.name }}
                  </strong>
                  <span class="text-xs text-[var(--text-muted)]">
                    {{ formatBytes(logoFile.size) }}
                  </span>
                </div>
                <button
                  type="button"
                  class="rounded-lg border border-[var(--border)] px-2.5 py-2 text-xs font-semibold text-[var(--text-soft)]"
                  :disabled="busy"
                  @click="clearLogo"
                >
                  移除
                </button>
              </div>
              <button
                v-else
                type="button"
                class="mt-2 w-full rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] px-4 py-6 text-sm font-bold text-[var(--text-soft)] transition hover:border-indigo-400 hover:text-indigo-600"
                :disabled="busy"
                @click="logoInputRef?.click()"
              >
                选择 Logo 图片
              </button>
              <input
                ref="logoInputRef"
                class="sr-only"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.ico,.svg,image/jpeg,image/png,image/webp,image/gif,image/bmp,image/vnd.microsoft.icon,image/svg+xml"
                tabindex="-1"
                @change="selectLogo"
              />
            </div>

            <label
              class="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-3.5 py-3"
            >
              <span>
                <strong class="block text-sm text-[var(--text)]">
                  平铺水印
                </strong>
                <span class="mt-1 block text-xs text-[var(--text-muted)]">
                  重复覆盖整张图片
                </span>
              </span>
              <input v-model="watermarkTiled" class="size-4" type="checkbox" />
            </label>

            <fieldset v-if="!watermarkTiled" class="mt-5">
              <legend class="text-sm font-semibold text-[var(--text-soft)]">
                水印位置
              </legend>
              <div class="mt-2 grid grid-cols-3 gap-2">
                <button
                  v-for="position in positionOptions"
                  :key="position.value"
                  type="button"
                  class="min-h-10 rounded-lg border px-2 py-2 text-xs font-semibold transition"
                  :class="
                    watermarkPosition === position.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                      : 'border-[var(--border)] text-[var(--text-soft)] hover:border-indigo-300'
                  "
                  :aria-pressed="watermarkPosition === position.value"
                  @click="watermarkPosition = position.value"
                >
                  {{ position.label }}
                </button>
              </div>
            </fieldset>

            <div class="mt-5 grid grid-cols-2 gap-3">
              <label v-if="watermarkKind === 'text'">
                <span class="text-sm font-semibold text-[var(--text-soft)]">
                  字号
                </span>
                <input
                  v-model.number="watermarkFontSize"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="8"
                  max="512"
                />
              </label>
              <label v-else>
                <span class="text-sm font-semibold text-[var(--text-soft)]">
                  Logo 大小
                </span>
                <div class="relative mt-2">
                  <input
                    v-model.number="watermarkLogoSize"
                    class="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 pr-8 text-sm text-[var(--text)]"
                    type="number"
                    min="1"
                    max="100"
                  />
                  <span
                    class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-[var(--text-muted)]"
                  >
                    %
                  </span>
                </div>
              </label>
              <label>
                <span class="text-sm font-semibold text-[var(--text-soft)]">
                  {{ watermarkTiled ? "平铺间距" : "边距" }}
                </span>
                <input
                  v-if="watermarkTiled"
                  v-model.number="watermarkTileGap"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="0"
                  max="4096"
                />
                <input
                  v-else
                  v-model.number="watermarkMargin"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="0"
                  max="4096"
                />
              </label>
            </div>

            <label class="mt-5 block">
              <span
                class="flex items-center justify-between text-sm font-semibold text-[var(--text-soft)]"
              >
                <span>透明度</span>
                <span class="tabular-nums">{{ watermarkOpacity }}%</span>
              </span>
              <input
                v-model.number="watermarkOpacity"
                class="mt-3 w-full"
                type="range"
                min="0"
                max="100"
                step="1"
              />
            </label>

            <label class="mt-5 block">
              <span
                class="flex items-center justify-between text-sm font-semibold text-[var(--text-soft)]"
              >
                <span>旋转角度</span>
                <span class="tabular-nums">{{ watermarkRotation }}°</span>
              </span>
              <input
                v-model.number="watermarkRotation"
                class="mt-3 w-full"
                type="range"
                min="-180"
                max="180"
                step="1"
              />
            </label>

            <label
              v-if="watermarkKind === 'text'"
              class="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-3.5 py-3"
            >
              <span class="text-sm font-semibold text-[var(--text-soft)]">
                文字颜色
              </span>
              <input
                v-model="watermarkColor"
                class="size-10 rounded-lg border border-[var(--border)] bg-transparent p-1"
                type="color"
                aria-label="选择水印文字颜色"
              />
            </label>
          </section>

          <section
            v-else-if="mode === 'rounded'"
            class="surface-card p-5"
            aria-labelledby="rounded-settings"
          >
            <h2 id="rounded-settings" class="font-bold text-[var(--text)]">
              圆角设置
            </h2>

            <div
              class="mt-5 grid grid-cols-2 rounded-xl bg-[var(--surface-subtle)] p-1"
              aria-label="圆角单位"
            >
              <button
                v-for="option in [
                  { value: 'px', label: '像素 px' },
                  { value: 'percent', label: '百分比 %' },
                ]"
                :key="option.value"
                type="button"
                class="rounded-lg px-3 py-2 text-sm font-bold transition"
                :class="
                  cornerUnit === option.value
                    ? 'bg-[var(--surface)] text-indigo-700 shadow-sm dark:text-indigo-300'
                    : 'text-[var(--text-muted)]'
                "
                :aria-pressed="cornerUnit === option.value"
                @click="cornerUnit = option.value as CornerRadiusUnit"
              >
                {{ option.label }}
              </button>
            </div>

            <label
              class="mt-4 flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-3.5 py-3"
            >
              <span>
                <strong class="block text-sm text-[var(--text)]">
                  四角统一
                </strong>
                <span class="mt-1 block text-xs text-[var(--text-muted)]">
                  关闭后可分别设置每个角
                </span>
              </span>
              <input
                v-model="useUniformCorners"
                class="size-4"
                type="checkbox"
              />
            </label>

            <label v-if="useUniformCorners" class="mt-5 block">
              <span
                class="flex items-center justify-between text-sm font-semibold text-[var(--text-soft)]"
              >
                <span>圆角半径</span>
                <span class="tabular-nums">
                  {{ cornerRadius }} {{ cornerUnit === "px" ? "px" : "%" }}
                </span>
              </span>
              <input
                v-model.number="cornerRadius"
                class="mt-3 w-full"
                type="range"
                min="0"
                :max="cornerRadiusMax"
                step="1"
              />
              <input
                v-model.number="cornerRadius"
                class="mt-3 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                type="number"
                min="0"
                :max="cornerRadiusMax"
              />
            </label>

            <div v-else class="mt-5 grid grid-cols-2 gap-3">
              <label>
                <span class="text-sm font-semibold text-[var(--text-soft)]">
                  左上
                </span>
                <input
                  v-model.number="cornerTopLeft"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="0"
                  :max="cornerRadiusMax"
                />
              </label>
              <label>
                <span class="text-sm font-semibold text-[var(--text-soft)]">
                  右上
                </span>
                <input
                  v-model.number="cornerTopRight"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="0"
                  :max="cornerRadiusMax"
                />
              </label>
              <label>
                <span class="text-sm font-semibold text-[var(--text-soft)]">
                  左下
                </span>
                <input
                  v-model.number="cornerBottomLeft"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="0"
                  :max="cornerRadiusMax"
                />
              </label>
              <label>
                <span class="text-sm font-semibold text-[var(--text-soft)]">
                  右下
                </span>
                <input
                  v-model.number="cornerBottomRight"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="0"
                  :max="cornerRadiusMax"
                />
              </label>
            </div>
          </section>

          <section
            v-else
            class="surface-card p-5"
            aria-labelledby="padding-settings"
          >
            <h2 id="padding-settings" class="font-bold text-[var(--text)]">
              留白设置
            </h2>

            <label
              class="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-3.5 py-3"
            >
              <span>
                <strong class="block text-sm text-[var(--text)]">
                  四边统一
                </strong>
                <span class="mt-1 block text-xs text-[var(--text-muted)]">
                  关闭后可分别设置四边
                </span>
              </span>
              <input
                v-model="useUniformPadding"
                class="size-4"
                type="checkbox"
              />
            </label>

            <label v-if="useUniformPadding" class="mt-5 block">
              <span class="text-sm font-semibold text-[var(--text-soft)]">
                统一边距
              </span>
              <input
                v-model.number="uniformPadding"
                class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                type="number"
                min="0"
                max="4096"
              />
            </label>

            <div v-else class="mt-5 grid grid-cols-2 gap-3">
              <label
                v-for="field in [
                  { label: '上边距', key: 'top' },
                  { label: '右边距', key: 'right' },
                  { label: '下边距', key: 'bottom' },
                  { label: '左边距', key: 'left' },
                ]"
                :key="field.key"
              >
                <span class="text-sm font-semibold text-[var(--text-soft)]">
                  {{ field.label }}
                </span>
                <input
                  v-if="field.key === 'top'"
                  v-model.number="paddingTop"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="0"
                  max="4096"
                />
                <input
                  v-else-if="field.key === 'right'"
                  v-model.number="paddingRight"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="0"
                  max="4096"
                />
                <input
                  v-else-if="field.key === 'bottom'"
                  v-model.number="paddingBottom"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="0"
                  max="4096"
                />
                <input
                  v-else
                  v-model.number="paddingLeft"
                  class="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)]"
                  type="number"
                  min="0"
                  max="4096"
                />
              </label>
            </div>

            <fieldset class="mt-5">
              <legend class="text-sm font-semibold text-[var(--text-soft)]">
                留白背景
              </legend>
              <div class="mt-2 grid grid-cols-3 gap-2">
                <label
                  v-for="option in [
                    { value: 'solid', label: '纯色' },
                    { value: 'gradient', label: '渐变' },
                    { value: 'transparent', label: '透明' },
                  ]"
                  :key="option.value"
                  class="cursor-pointer rounded-lg border px-3 py-2.5 text-center text-sm font-semibold transition focus-within:ring-2 focus-within:ring-indigo-500"
                  :class="
                    paddingBackgroundMode === option.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                      : 'border-[var(--border)] text-[var(--text-soft)]'
                  "
                >
                  <input
                    v-model="paddingBackgroundMode"
                    class="sr-only"
                    type="radio"
                    name="padding-background-mode"
                    :value="option.value"
                  />
                  {{ option.label }}
                </label>
              </div>
            </fieldset>

            <template v-if="paddingBackgroundMode !== 'transparent'">
              <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <label
                  class="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-3.5 py-3"
                >
                  <span class="text-sm font-semibold text-[var(--text-soft)]">
                    {{
                      paddingBackgroundMode === "gradient"
                        ? "起始颜色"
                        : "留白颜色"
                    }}
                  </span>
                  <input
                    v-model="paddingBackground"
                    class="size-10 rounded-lg border border-[var(--border)] bg-transparent p-1"
                    type="color"
                    aria-label="选择留白起始颜色"
                  />
                </label>
                <label
                  v-if="paddingBackgroundMode === 'gradient'"
                  class="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-3.5 py-3"
                >
                  <span class="text-sm font-semibold text-[var(--text-soft)]">
                    结束颜色
                  </span>
                  <input
                    v-model="paddingGradientEnd"
                    class="size-10 rounded-lg border border-[var(--border)] bg-transparent p-1"
                    type="color"
                    aria-label="选择留白结束颜色"
                  />
                </label>
              </div>

              <fieldset
                v-if="paddingBackgroundMode === 'gradient'"
                class="mt-4"
              >
                <legend class="text-sm font-semibold text-[var(--text-soft)]">
                  渐变方向
                </legend>
                <div class="mt-2 grid grid-cols-2 gap-2">
                  <label
                    v-for="option in [
                      { value: 'horizontal', label: '水平' },
                      { value: 'vertical', label: '垂直' },
                    ]"
                    :key="option.value"
                    class="cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-semibold transition focus-within:ring-2 focus-within:ring-indigo-500"
                    :class="
                      paddingGradientDirection === option.value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                        : 'border-[var(--border)] text-[var(--text-soft)]'
                    "
                  >
                    <input
                      v-model="paddingGradientDirection"
                      class="sr-only"
                      type="radio"
                      name="padding-gradient-direction"
                      :value="option.value"
                    />
                    {{ option.label }}
                  </label>
                </div>
              </fieldset>

              <label class="mt-4 block">
                <span
                  class="flex items-center justify-between text-sm font-semibold text-[var(--text-soft)]"
                >
                  <span>背景不透明度</span>
                  <span class="tabular-nums">
                    {{ paddingBackgroundOpacity }}%
                  </span>
                </span>
                <input
                  v-model.number="paddingBackgroundOpacity"
                  class="mt-3 w-full"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                />
              </label>
            </template>
            <p
              v-if="paddingBackgroundMode === 'transparent'"
              class="mt-4 rounded-lg bg-[var(--surface-subtle)] px-3 py-2.5 text-xs leading-5 text-[var(--text-muted)]"
            >
              PNG 与 WebP 会保留透明留白；JPEG 不支持透明，将使用白色填充。
            </p>

            <p
              v-if="pendingDimensions"
              class="mt-4 rounded-lg bg-[var(--surface-subtle)] px-3 py-2.5 text-xs leading-5 text-[var(--text-muted)]"
            >
              预计输出：{{ pendingDimensions.width }} ×
              {{ pendingDimensions.height }} px
            </p>
          </section>

          <section
            class="surface-card p-5"
            aria-labelledby="effect-output-settings"
          >
            <h2
              id="effect-output-settings"
              class="font-bold text-[var(--text)]"
            >
              导出设置
            </h2>
            <fieldset class="mt-5">
              <legend class="text-sm font-semibold text-[var(--text-soft)]">
                图片格式
              </legend>
              <div class="mt-2 grid grid-cols-3 gap-2">
                <label
                  v-for="option in outputOptions"
                  :key="option.value"
                  class="rounded-lg border px-2 py-2.5 text-center text-sm font-semibold transition focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-slate-900"
                  :class="
                    !option.enabled
                      ? 'cursor-not-allowed border-[var(--border)] text-[var(--text-muted)] opacity-50'
                      : outputMime === option.value
                        ? 'cursor-pointer border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                        : 'cursor-pointer border-[var(--border)] text-[var(--text-soft)] hover:border-indigo-300'
                  "
                >
                  <input
                    v-model="outputMime"
                    class="sr-only"
                    type="radio"
                    name="effect-output-format"
                    :value="option.value"
                    :disabled="busy || !option.enabled"
                  />
                  {{ option.label }}
                </label>
              </div>
            </fieldset>

            <label v-if="qualityEnabled" class="mt-5 block">
              <span
                class="flex items-center justify-between text-sm font-semibold text-[var(--text-soft)]"
              >
                <span>输出质量</span>
                <span class="tabular-nums">{{ quality }}%</span>
              </span>
              <input
                v-model.number="quality"
                class="mt-3 w-full"
                type="range"
                min="0"
                max="100"
                step="1"
              />
            </label>

            <label
              v-if="outputMime === 'image/jpeg' && mode !== 'padding'"
              class="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-3.5 py-3"
            >
              <span class="text-sm font-semibold text-[var(--text-soft)]">
                JPEG 背景
              </span>
              <input
                v-model="jpegBackground"
                class="size-10 rounded-lg border border-[var(--border)] bg-transparent p-1"
                type="color"
                aria-label="选择 JPEG 背景颜色"
              />
            </label>
          </section>

          <button
            v-if="!isProcessing"
            type="button"
            class="primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black shadow-sm transition hover:bg-indigo-700 disabled:opacity-55"
            :disabled="busy || !sourceFile"
            @click="processCurrentImage"
          >
            <Play :size="18" aria-hidden="true" />
            {{ content.action }}
          </button>
          <button
            v-else
            type="button"
            class="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-3 text-sm font-bold text-[var(--text)]"
            @click="cancelProcessing"
          >
            <LoaderCircle class="animate-spin" :size="18" aria-hidden="true" />
            取消处理
          </button>

          <button
            v-if="result"
            type="button"
            class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-3 text-sm font-bold text-[var(--text)] transition hover:border-indigo-300"
            @click="processCurrentImage"
          >
            <RotateCcw :size="17" aria-hidden="true" />
            重新生成
          </button>
        </aside>
      </div>
    </section>

    <section class="border-y border-[var(--border)] bg-[var(--surface)]">
      <div
        class="page-container grid gap-8 py-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-14"
      >
        <div>
          <h2 class="text-xl font-black text-[var(--text)]">使用步骤</h2>
          <ol class="mt-5 grid gap-3">
            <li
              v-for="(step, index) in content.guide"
              :key="step"
              class="flex items-start gap-3 text-sm leading-6 text-[var(--text-soft)]"
            >
              <span
                class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
              >
                {{ index + 1 }}
              </span>
              {{ step }}
            </li>
          </ol>
        </div>
        <div>
          <h2 class="text-xl font-black text-[var(--text)]">常见问题</h2>
          <details class="surface-card mt-5 p-5" open>
            <summary
              class="cursor-pointer text-sm font-bold text-[var(--text)]"
            >
              {{ content.faq.question }}
            </summary>
            <p class="mt-3 text-sm leading-6 text-[var(--text-soft)]">
              {{ content.faq.answer }}
            </p>
          </details>
          <p
            class="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            <ShieldCheck class="mt-1 shrink-0" :size="16" aria-hidden="true" />
            图片、参数与处理结果仅存在于当前浏览器会话中，刷新或关闭页面后不会自动保留。
          </p>
        </div>
      </div>
    </section>
  </main>
</template>
