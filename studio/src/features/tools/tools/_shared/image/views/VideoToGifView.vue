<script setup lang="ts">
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Film,
  LoaderCircle,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from '@/features/tools/tools/_shared/image/icons';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import ImageDropzone from '@/features/tools/tools/_shared/image/components/upload/ImageDropzone.vue';
import ImageToolHeader from '@/features/tools/tools/_shared/image/components/layout/ImageToolHeader.vue';
import {
  createGifAnimationEncoder,
  MAX_VIDEO_GIF_FRAMES,
  MAX_VIDEO_GIF_SIDE,
  MAX_VIDEO_GIF_TOTAL_PIXELS,
} from '@/features/tools/tools/_shared/image/core/image/gif';
import { downloadBlob } from '@/core/browser/download';
import { formatBytes } from '@/features/tools/tools/_shared/image/format';

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

interface VideoGifSettings {
  start: number;
  end: number;
  fps: number;
  width: number;
  height: number;
  frameCount: number;
}

defineProps<{ embedded?: boolean }>();

const MAX_FILE_BYTES = 500 * 1024 * 1024;
const supportedExtensions = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv', 'avi']);
const videoRef = ref<HTMLVideoElement | null>(null);
const file = ref<File | null>(null);
const sourceUrl = ref('');
const metadata = ref<VideoMetadata>({ duration: 0, width: 0, height: 0 });
const startTime = ref(0);
const endTime = ref(5);
const outputEdge = ref(480);
const fps = ref(10);
const colorMode = ref<'compact' | 'dither'>('dither');
const shouldLoop = ref(true);
const isReading = ref(false);
const isGenerating = ref(false);
const progress = ref(0);
const progressMessage = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const resultBlob = ref<Blob | null>(null);
const resultUrl = ref('');
let generationController: AbortController | null = null;

const isBusy = computed(() => isReading.value || isGenerating.value);
const maximumSourceEdge = computed(() => Math.max(metadata.value.width, metadata.value.height));
const maximumOutputEdge = computed(() =>
  Math.min(MAX_VIDEO_GIF_SIDE, maximumSourceEdge.value || 1),
);
const minimumOutputEdge = computed(() => Math.min(120, maximumOutputEdge.value));

function fileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

function gifFilename(filename: string): string {
  const base = filename
    .replace(/\.[^.]+$/u, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60);
  return `${base || 'video'}.gif`;
}

function abortError(): DOMException {
  return new DOMException('GIF 生成已取消', 'AbortError');
}

function releaseResult(): void {
  if (resultUrl.value) {
    URL.revokeObjectURL(resultUrl.value);
    resultUrl.value = '';
  }
  resultBlob.value = null;
  successMessage.value = '';
}

function releaseSource(): void {
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value);
    sourceUrl.value = '';
  }
}

function getSettings(): VideoGifSettings {
  const duration = metadata.value.duration;
  const start = Number(startTime.value);
  const end = Number(endTime.value);
  const edge = Math.round(Number(outputEdge.value));
  const frameRate = Number(fps.value);

  if (!file.value || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('请先选择可读取的视频文件。');
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error('请输入有效的开始和结束时间。');
  }
  if (start < 0 || end > duration + 0.05) {
    throw new Error('截取时间不能超出视频时长。');
  }
  if (end - start < 0.1) {
    throw new Error('结束时间需至少比开始时间晚 0.1 秒。');
  }
  if (!Number.isFinite(edge) || edge < 1 || edge > maximumOutputEdge.value) {
    throw new Error(`输出最长边需在 1–${maximumOutputEdge.value}px 之间。`);
  }
  if (![5, 8, 10, 12, 15].includes(frameRate)) {
    throw new Error('请选择有效的输出帧率。');
  }

  const scale = Math.min(1, edge / maximumSourceEdge.value);
  const width = Math.max(1, Math.round(metadata.value.width * scale));
  const height = Math.max(1, Math.round(metadata.value.height * scale));
  const frameCount = Math.max(1, Math.ceil((end - start) * frameRate));
  if (frameCount > MAX_VIDEO_GIF_FRAMES) {
    throw new Error(
      `当前设置会生成 ${frameCount} 帧，请缩短片段或降低帧率（最多 ${MAX_VIDEO_GIF_FRAMES} 帧）。`,
    );
  }
  if (width * height * frameCount > MAX_VIDEO_GIF_TOTAL_PIXELS) {
    throw new Error('当前画面尺寸与帧数较大，请降低最长边、帧率或缩短片段。');
  }
  return { start, end: Math.min(end, duration), fps: frameRate, width, height, frameCount };
}

const estimate = computed(() => {
  if (!file.value || !metadata.value.duration) {
    return { valid: false, message: '选择视频后显示输出信息' };
  }
  try {
    const settings = getSettings();
    return {
      valid: true,
      message: `${settings.width} × ${settings.height} px · ${settings.frameCount} 帧 · 约 ${formatDuration(settings.frameCount / settings.fps)}`,
    };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : '当前设置无效。',
    };
  }
});

function isVideoFile(candidate: File): boolean {
  return (
    candidate.type.startsWith('video/') || supportedExtensions.has(fileExtension(candidate.name))
  );
}

function selectFiles(files: File[]): void {
  if (isBusy.value) return;
  const selected = files[0];
  if (!selected) return;
  errorMessage.value = '';
  if (!isVideoFile(selected)) {
    errorMessage.value = '请选择有效的视频文件。';
    return;
  }
  if (selected.size === 0 || selected.size > MAX_FILE_BYTES) {
    errorMessage.value = `视频文件需大于 0 且不超过 ${formatBytes(MAX_FILE_BYTES)}。`;
    return;
  }

  releaseSource();
  releaseResult();
  file.value = selected;
  metadata.value = { duration: 0, width: 0, height: 0 };
  progress.value = 0;
  progressMessage.value = '';
  isReading.value = true;
  sourceUrl.value = URL.createObjectURL(selected);
}

function readMetadata(): void {
  const video = videoRef.value;
  if (!video || !file.value) return;
  if (
    !Number.isFinite(video.duration) ||
    video.duration <= 0 ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    isReading.value = false;
    errorMessage.value = '无法读取视频时长或画面尺寸，请尝试其他格式。';
    return;
  }

  metadata.value = {
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
  };
  startTime.value = 0;
  endTime.value = Number(Math.min(5, video.duration).toFixed(2));
  outputEdge.value = Math.min(480, maximumOutputEdge.value);
  isReading.value = false;
}

function handleVideoError(): void {
  if (!file.value) return;
  isReading.value = false;
  errorMessage.value = '当前浏览器无法解码该视频，请尝试 MP4（H.264）或 WebM 格式。';
}

function seekVideo(target: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = videoRef.value;
    if (!video) {
      reject(new Error('视频预览尚未就绪。'));
      return;
    }
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const safeTarget = Math.max(0, Math.min(target, Math.max(0, video.duration - 0.001)));
    if (Math.abs(video.currentTime - safeTarget) < 0.002 && video.readyState >= 2) {
      requestAnimationFrame(() => (signal.aborted ? reject(abortError()) : resolve()));
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('读取视频画面超时，请尝试缩短片段或更换视频格式。'));
    }, 10_000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onSeeked = () => {
      cleanup();
      requestAnimationFrame(() => (signal.aborted ? reject(abortError()) : resolve()));
    };
    const onError = () => {
      cleanup();
      reject(new Error('无法读取指定的视频画面。'));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      video.currentTime = safeTarget;
    } catch {
      cleanup();
      reject(new Error('无法定位到所选视频片段。'));
    }
  });
}

async function generateGif(): Promise<void> {
  const video = videoRef.value;
  if (!video || !file.value || isBusy.value) return;
  errorMessage.value = '';
  releaseResult();

  let settings: VideoGifSettings;
  try {
    settings = getSettings();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '当前设置无效。';
    return;
  }

  const controller = new AbortController();
  generationController = controller;
  isGenerating.value = true;
  progress.value = 0;
  progressMessage.value = '正在准备视频画面…';
  video.pause();

  try {
    const canvas = document.createElement('canvas');
    canvas.width = settings.width;
    canvas.height = settings.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('当前浏览器无法创建 Canvas 2D 上下文。');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    const encoder = createGifAnimationEncoder({
      width: settings.width,
      height: settings.height,
      delayMs: 1000 / settings.fps,
      loop: shouldLoop.value ? 0 : null,
      signal: controller.signal,
      profile: 'video',
      colorMode: colorMode.value,
    });

    for (let index = 0; index < settings.frameCount; index += 1) {
      const time = Math.min(settings.start + index / settings.fps, settings.end - 0.001);
      await seekVideo(time, controller.signal);
      if (controller.signal.aborted) throw abortError();
      context.fillStyle = '#000';
      context.fillRect(0, 0, settings.width, settings.height);
      context.drawImage(video, 0, 0, settings.width, settings.height);
      encoder.addFrame({
        width: settings.width,
        height: settings.height,
        data: context.getImageData(0, 0, settings.width, settings.height).data,
      });
      progress.value = Math.round(((index + 1) / settings.frameCount) * 100);
      progressMessage.value = `正在处理第 ${index + 1} / ${settings.frameCount} 帧`;
    }

    const blob = encoder.finish();
    if (controller.signal.aborted) throw abortError();
    resultBlob.value = blob;
    resultUrl.value = URL.createObjectURL(blob);
    successMessage.value = `GIF 已生成：${settings.width} × ${settings.height} px · ${settings.frameCount} 帧 · ${formatBytes(blob.size)}。`;
    progressMessage.value = 'GIF 已生成';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      progress.value = 0;
      progressMessage.value = '转换已取消';
    } else {
      errorMessage.value =
        error instanceof Error ? error.message : 'GIF 生成失败，请调整设置后重试。';
      progressMessage.value = '';
    }
  } finally {
    if (generationController === controller) {
      generationController = null;
      isGenerating.value = false;
    }
  }
}

function cancelGeneration(): void {
  generationController?.abort();
}

function clearAll(): void {
  generationController?.abort();
  videoRef.value?.pause();
  releaseSource();
  releaseResult();
  file.value = null;
  metadata.value = { duration: 0, width: 0, height: 0 };
  errorMessage.value = '';
  progress.value = 0;
  progressMessage.value = '';
  isReading.value = false;
}

function downloadResult(): void {
  if (resultBlob.value && file.value && !isBusy.value) {
    downloadBlob(resultBlob.value, gifFilename(file.value.name));
  }
}

watch([startTime, endTime, outputEdge, fps, colorMode, shouldLoop], () => {
  if (!isGenerating.value) releaseResult();
});

onBeforeUnmount(() => {
  generationController?.abort();
  releaseSource();
  releaseResult();
});
</script>

<template>
  <component
    :is="embedded ? 'div' : 'main'"
    id="main-content"
    class="min-h-[calc(100vh-72px)] bg-[var(--page)]"
  >
    <ImageToolHeader
      title="视频转GIF"
      description="截取本地视频片段，设置尺寸、帧率和色彩模式后生成 GIF。"
      :icon="Film"
    />

    <section class="tool-workbench" aria-label="视频转 GIF 工作台">
      <div class="tool-workbench__privacy" role="note">
        <ShieldCheck :size="16" aria-hidden="true" />
        <span>本地处理 · 视频不会上传</span>
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

      <div v-if="!file" class="grid gap-3">
        <ImageDropzone
          accept="video/*,.mp4,.m4v,.mov,.webm,.ogv,.ogg,.mkv,.avi"
          description="支持格式取决于浏览器，建议使用 MP4（H.264）或 WebM"
          :disabled="isBusy"
          :multiple="false"
          prompt="拖入视频，或点击选择本地文件"
          @files="selectFiles"
        />
        <p class="text-center text-xs leading-5 text-[var(--text-muted)]">
          单个文件不超过 {{ formatBytes(MAX_FILE_BYTES) }}；最多
          {{ MAX_VIDEO_GIF_FRAMES }} 帧，最长边不超过 {{ MAX_VIDEO_GIF_SIDE }}px。
        </p>
      </div>

      <div v-else class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="grid min-w-0 gap-5">
          <section class="surface-card overflow-hidden">
            <header
              class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5"
            >
              <div class="min-w-0">
                <h2 class="truncate text-sm font-bold text-[var(--text)]" :title="file.name">
                  {{ file.name }}
                </h2>
                <p class="mt-1 text-xs text-[var(--text-muted)]">
                  {{ formatBytes(file.size) }}
                  <template v-if="metadata.width">
                    · {{ metadata.width }} × {{ metadata.height }} px ·
                    {{ formatDuration(metadata.duration) }}
                  </template>
                </p>
              </div>
              <button
                type="button"
                class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-45 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                :disabled="isGenerating"
                @click="clearAll"
              >
                <Trash2 :size="14" aria-hidden="true" />
                更换视频
              </button>
            </header>
            <div class="grid min-h-72 place-items-center bg-black">
              <video
                ref="videoRef"
                class="block max-h-[560px] w-full bg-black"
                :src="sourceUrl"
                controls
                playsinline
                preload="metadata"
                @loadedmetadata="readMetadata"
                @error="handleVideoError"
              ></video>
            </div>
            <p
              v-if="isReading"
              class="flex items-center justify-center gap-2 border-t border-[var(--border)] px-5 py-3 text-xs font-semibold text-[var(--text-muted)]"
              role="status"
            >
              <LoaderCircle class="animate-spin" :size="15" aria-hidden="true" />
              正在读取视频信息…
            </p>
          </section>

          <section v-if="resultUrl" class="surface-card overflow-hidden">
            <header
              class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"
            >
              <div>
                <h2 class="text-sm font-bold text-[var(--text)]">GIF 预览</h2>
                <p class="mt-1 text-xs text-[var(--text-muted)]">按当前循环与帧率设置播放</p>
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

        <aside class="grid gap-4 xl:sticky xl:top-[92px]" aria-label="GIF 转换参数">
          <section class="surface-card overflow-hidden">
            <header class="border-b border-[var(--border)] px-5 py-4">
              <h2 class="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                <Settings2 class="text-indigo-600" :size="18" aria-hidden="true" />
                转换设置
              </h2>
            </header>

            <div class="grid gap-5 p-5">
              <fieldset class="grid gap-3">
                <legend class="text-sm font-semibold text-[var(--text)]">截取范围</legend>
                <div class="grid grid-cols-2 gap-3">
                  <label class="grid gap-2 text-xs font-semibold text-[var(--text-soft)]">
                    开始时间（秒）
                    <input
                      v-model.number="startTime"
                      class="h-10 min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                      type="number"
                      min="0"
                      :max="metadata.duration"
                      step="0.1"
                      :disabled="isBusy"
                    />
                  </label>
                  <label class="grid gap-2 text-xs font-semibold text-[var(--text-soft)]">
                    结束时间（秒）
                    <input
                      v-model.number="endTime"
                      class="h-10 min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                      type="number"
                      min="0.1"
                      :max="metadata.duration"
                      step="0.1"
                      :disabled="isBusy"
                    />
                  </label>
                </div>
              </fieldset>

              <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                输出最长边（px）
                <input
                  v-model.number="outputEdge"
                  class="h-10 min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                  type="number"
                  :min="minimumOutputEdge"
                  :max="maximumOutputEdge"
                  step="10"
                  :disabled="isBusy"
                />
                <span class="text-xs leading-5 font-normal text-[var(--text-muted)]">
                  保持原比例且不放大，最大 {{ maximumOutputEdge }}px。
                </span>
              </label>

              <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                帧率
                <span class="image-select">
                  <select v-model.number="fps" class="image-select__control" :disabled="isBusy">
                    <option :value="5">5 FPS</option>
                    <option :value="8">8 FPS</option>
                    <option :value="10">10 FPS</option>
                    <option :value="12">12 FPS</option>
                    <option :value="15">15 FPS</option>
                  </select>
                  <ChevronDown class="image-select__icon" :size="18" aria-hidden="true" />
                </span>
              </label>

              <label class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                色彩模式
                <span class="image-select">
                  <select v-model="colorMode" class="image-select__control" :disabled="isBusy">
                    <option value="dither">色彩优化（推荐）</option>
                    <option value="compact">较小体积</option>
                  </select>
                  <ChevronDown class="image-select__icon" :size="18" aria-hidden="true" />
                </span>
              </label>

              <label
                class="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text)]"
              >
                <input
                  v-model="shouldLoop"
                  class="size-4 accent-[var(--primary)]"
                  type="checkbox"
                  :disabled="isBusy"
                />
                循环播放
              </label>

              <div
                class="rounded-xl border p-3 text-xs leading-5"
                :class="
                  estimate.valid
                    ? 'border-[var(--primary-border)] bg-[var(--primary-soft)] text-[var(--primary-hover)]'
                    : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200'
                "
              >
                {{ estimate.message }}
              </div>

              <div v-if="isGenerating || progressMessage" class="grid gap-2" aria-live="polite">
                <div
                  class="h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-valuenow="progress"
                >
                  <span
                    class="block h-full rounded-full bg-indigo-600 transition-[width] duration-150"
                    :style="{ width: `${progress}%` }"
                  ></span>
                </div>
                <p class="text-xs text-[var(--text-muted)]">{{ progressMessage }}</p>
              </div>

              <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  v-if="!isGenerating"
                  type="button"
                  class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  :disabled="!estimate.valid || isBusy"
                  @click="generateGif"
                >
                  <Film :size="17" aria-hidden="true" />
                  生成 GIF
                </button>
                <button
                  v-else
                  type="button"
                  class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-300 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
                  @click="cancelGeneration"
                >
                  <X :size="17" aria-hidden="true" />
                  取消转换
                </button>
                <button
                  type="button"
                  class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--text-muted)] transition hover:bg-[var(--surface-subtle)] disabled:opacity-50"
                  :disabled="isGenerating"
                  @click="clearAll"
                >
                  <Trash2 :size="16" aria-hidden="true" />
                  清空
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  </component>
</template>
