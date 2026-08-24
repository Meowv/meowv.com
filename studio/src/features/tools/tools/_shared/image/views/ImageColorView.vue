<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import ImageToolHeader from '@/features/tools/tools/_shared/image/components/layout/ImageToolHeader.vue';
import ImageDropzone from '@/features/tools/tools/_shared/image/components/upload/ImageDropzone.vue';
import { useImagePaste } from '@/features/tools/tools/_shared/image/composables/useImagePaste';
import {
  createImagePreviewBlob,
  detectImageMime,
  INPUT_IMAGE_ACCEPT,
  sanitizeSvgFile,
} from '@/features/tools/tools/_shared/image/core/image';
import {
  Check,
  ColorPicker,
  Copy,
  Info,
  LoaderCircle,
  Palette,
  Trash2,
  X,
} from '@/features/tools/tools/_shared/image/icons';
import { formatBytes } from '@/features/tools/tools/_shared/image/format';
import { useFileHandoff } from '@/core/browser/file-handoff';

interface ImageColor {
  hex: string;
  rgb: string;
  hsl: string;
  percentage?: number;
}

interface ImageDimensions {
  width: number;
  height: number;
}

defineProps<{ embedded?: boolean }>();

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const canvas = ref<HTMLCanvasElement | null>(null);
const sourceFile = ref<File | null>(null);
const sourceDimensions = ref<ImageDimensions | null>(null);
const picked = ref<ImageColor | null>(null);
const palette = ref<ImageColor[]>([]);
const errorMessage = ref('');
const statusMessage = ref('');
const isReading = ref(false);
const activeMode = ref<'picker' | 'dominant'>('picker');
const copiedValue = ref('');
let loadSequence = 0;
let copiedTimer: number | undefined;

const pickerActive = computed(() => activeMode.value === 'picker');
const dominantActive = computed(() => activeMode.value === 'dominant');

useImagePaste(selectSource, { disabled: isReading, multiple: false });

function channelToHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function colorDetails(red: number, green: number, blue: number): ImageColor {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = max - min;
  let hue = 0;

  if (delta) {
    if (max === normalizedRed) hue = ((normalizedGreen - normalizedBlue) / delta) % 6;
    else if (max === normalizedGreen) hue = (normalizedBlue - normalizedRed) / delta + 2;
    else hue = (normalizedRed - normalizedGreen) / delta + 4;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    hex: `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`.toUpperCase(),
    rgb: `rgb(${red}, ${green}, ${blue})`,
    hsl: `hsl(${hue}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`,
  };
}

function dominantColors(data: ImageData, limit = 8): ImageColor[] {
  const buckets = new Map<string, { red: number; green: number; blue: number; count: number }>();
  let opaquePixels = 0;

  for (let index = 0; index < data.data.length; index += 4) {
    if (data.data[index + 3] < 128) continue;
    const red = Math.min(255, Math.round(data.data[index] / 32) * 32);
    const green = Math.min(255, Math.round(data.data[index + 1] / 32) * 32);
    const blue = Math.min(255, Math.round(data.data[index + 2] / 32) * 32);
    const key = `${red},${green},${blue}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { red, green, blue, count: 1 });
    opaquePixels += 1;
  }

  return Array.from(buckets.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
    .map((bucket) => ({
      ...colorDetails(bucket.red, bucket.green, bucket.blue),
      percentage: opaquePixels ? Number(((bucket.count / opaquePixels) * 100).toFixed(1)) : 0,
    }));
}

function resetCanvas(): void {
  const target = canvas.value;
  if (!target) return;
  target.width = 1;
  target.height = 1;
}

function clearWorkspace(): void {
  loadSequence += 1;
  sourceFile.value = null;
  sourceDimensions.value = null;
  picked.value = null;
  palette.value = [];
  errorMessage.value = '';
  statusMessage.value = '';
  isReading.value = false;
  resetCanvas();
}

async function selectSource(files: File[]): Promise<void> {
  const selected = files[0];
  if (!selected || isReading.value) return;

  errorMessage.value = '';
  statusMessage.value = '';
  if (selected.size === 0) {
    errorMessage.value = '这个文件没有内容，请选择有效的图片。';
    return;
  }
  if (selected.size > MAX_FILE_BYTES) {
    errorMessage.value = `图片超过 ${formatBytes(MAX_FILE_BYTES)}，请先缩小文件后再试。`;
    return;
  }

  const sequence = ++loadSequence;
  isReading.value = true;
  let bitmap: ImageBitmap | null = null;

  try {
    const mime = await detectImageMime(selected);
    if (!mime) {
      throw new TypeError('无法识别图片格式，文件可能已损坏。');
    }

    const prepared = mime === 'image/svg+xml' ? await sanitizeSvgFile(selected) : selected;
    bitmap = await createImageBitmap(await createImagePreviewBlob(prepared));
    if (sequence !== loadSequence) return;

    sourceFile.value = selected;
    sourceDimensions.value = { width: bitmap.width, height: bitmap.height };
    picked.value = null;
    palette.value = [];
    await nextTick();

    if (sequence !== loadSequence) return;
    const target = canvas.value;
    if (!target) throw new Error('图片画布初始化失败。');

    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    target.width = Math.max(1, Math.round(bitmap.width * scale));
    target.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = target.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('当前浏览器无法读取图片颜色。');
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    const sample = document.createElement('canvas');
    const sampleScale = Math.min(1, 160 / Math.max(target.width, target.height));
    sample.width = Math.max(1, Math.round(target.width * sampleScale));
    sample.height = Math.max(1, Math.round(target.height * sampleScale));
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) throw new Error('当前浏览器无法分析图片颜色。');
    sampleContext.drawImage(target, 0, 0, sample.width, sample.height);
    palette.value = dominantColors(sampleContext.getImageData(0, 0, sample.width, sample.height));

    if (files.length > 1) {
      statusMessage.value = '当前工具一次分析一张图片，已载入第一张。';
    }
  } catch (error) {
    if (sequence !== loadSequence) return;
    sourceFile.value = null;
    sourceDimensions.value = null;
    picked.value = null;
    palette.value = [];
    resetCanvas();
    errorMessage.value = error instanceof Error ? error.message : '图片颜色读取失败。';
  } finally {
    bitmap?.close();
    if (sequence === loadSequence) isReading.value = false;
  }
}

function pick(event: MouseEvent): void {
  if (!pickerActive.value || !canvas.value || !sourceFile.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const x = Math.min(
    canvas.value.width - 1,
    Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * canvas.value.width)),
  );
  const y = Math.min(
    canvas.value.height - 1,
    Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * canvas.value.height)),
  );
  const context = canvas.value.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const [red, green, blue] = context.getImageData(x, y, 1, 1).data;
  picked.value = colorDetails(red, green, blue);
}

async function copyColor(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    copiedValue.value = value;
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copiedValue.value = '';
    }, 1800);
  } catch {
    errorMessage.value = '复制失败，请手动选择颜色值。';
  }
}

onMounted(async () => {
  const handoff = useFileHandoff().take('image');
  if (handoff) await selectSource([handoff]);
});

onBeforeUnmount(() => {
  loadSequence += 1;
  window.clearTimeout(copiedTimer);
});
</script>

<template>
  <component
    :is="embedded ? 'div' : 'main'"
    id="main-content"
    class="min-h-[calc(100vh-72px)] bg-[var(--page)]"
  >
    <ImageToolHeader
      title="图片取色与主色提取"
      description="点击图片精确取色，或提取图片的主色调色板。"
      :icon="ColorPicker"
    />

    <section class="tool-workbench" aria-label="图片取色与主色提取工作台">
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
      >
        <Info class="mt-0.5 shrink-0" :size="17" aria-hidden="true" />
        {{ statusMessage }}
      </div>

      <div v-if="!sourceFile" class="grid gap-3">
        <ImageDropzone
          :accept="INPUT_IMAGE_ACCEPT"
          description="支持 AVIF、BMP、GIF、HEIC、JPEG、PNG、PSD、SVG、TIFF、WebP，单张不超过 50 MB"
          :disabled="isReading"
          :multiple="false"
          @files="selectSource"
        />
        <p
          v-if="isReading"
          class="inline-flex items-center justify-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300"
          role="status"
        >
          <LoaderCircle class="animate-spin" :size="17" aria-hidden="true" />
          正在安全读取并分析图片…
        </p>
      </div>

      <div v-else class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section class="surface-card min-w-0 overflow-hidden">
          <header
            class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"
          >
            <div>
              <h2 class="font-bold text-[var(--text)]">图片预览</h2>
              <p v-if="sourceDimensions" class="mt-1 text-xs text-[var(--text-muted)]">
                {{ sourceFile.name }} · {{ sourceDimensions.width }} ×
                {{ sourceDimensions.height }} px · {{ formatBytes(sourceFile.size) }}
              </p>
            </div>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-soft)] transition hover:border-rose-300 hover:text-rose-600"
              :disabled="isReading"
              @click="clearWorkspace"
            >
              <Trash2 :size="16" aria-hidden="true" />
              移除图片
            </button>
          </header>
          <div class="checkerboard grid min-h-[420px] place-items-center overflow-hidden p-5">
            <canvas
              ref="canvas"
              class="image-color-canvas max-h-[680px] max-w-full rounded-lg shadow-lg"
              :class="{ 'image-color-canvas--picker': pickerActive }"
              :aria-label="pickerActive ? '点击图片读取颜色' : '主色提取图片预览'"
              @click="pick"
            />
          </div>
          <footer
            class="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--text-muted)]"
          >
            <ColorPicker v-if="pickerActive" :size="15" aria-hidden="true" />
            <Palette v-else :size="15" aria-hidden="true" />
            {{ pickerActive ? '点击图片任意位置读取颜色' : '右侧显示图片中占比最高的颜色' }}
          </footer>
        </section>

        <aside class="grid content-start gap-4" aria-label="颜色分析结果">
          <ImageDropzone
            compact
            :accept="INPUT_IMAGE_ACCEPT"
            description="选择另一张本地图片"
            :disabled="isReading"
            :multiple="false"
            prompt="更换图片"
            @files="selectSource"
          />

          <section class="surface-card overflow-hidden">
            <header class="border-b border-[var(--border)] px-5 py-4">
              <div class="flex items-center gap-2">
                <ColorPicker class="text-indigo-600" :size="18" aria-hidden="true" />
                <h2 class="text-sm font-bold text-[var(--text)]">颜色分析</h2>
              </div>
            </header>

            <div class="grid gap-5 p-5">
              <div
                class="grid grid-cols-2 rounded-xl bg-[var(--surface-subtle)] p-1"
                role="tablist"
                aria-label="图片颜色功能"
              >
                <button
                  type="button"
                  role="tab"
                  class="min-h-9 rounded-lg px-3 text-sm font-bold transition"
                  :class="
                    pickerActive
                      ? 'bg-[var(--surface)] text-indigo-600 shadow-sm'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                  "
                  :aria-selected="pickerActive"
                  @click="activeMode = 'picker'"
                >
                  图片取色
                </button>
                <button
                  type="button"
                  role="tab"
                  class="min-h-9 rounded-lg px-3 text-sm font-bold transition"
                  :class="
                    dominantActive
                      ? 'bg-[var(--surface)] text-indigo-600 shadow-sm'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                  "
                  :aria-selected="dominantActive"
                  @click="activeMode = 'dominant'"
                >
                  主色提取
                </button>
              </div>

              <div v-show="pickerActive" class="grid gap-4">
                <p class="text-xs leading-5 text-[var(--text-muted)]">
                  在左侧图片上点击任意位置，即可读取对应像素的颜色值。
                </p>
                <div
                  v-if="picked"
                  class="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4"
                >
                  <span
                    class="h-20 rounded-xl border border-[var(--border)] shadow-inner"
                    :style="{ backgroundColor: picked.hex }"
                    aria-hidden="true"
                  />
                  <div>
                    <strong class="font-mono text-lg text-[var(--text)]">{{ picked.hex }}</strong>
                    <p class="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                      {{ picked.rgb }}<br />{{ picked.hsl }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                    @click="copyColor(picked.hex)"
                  >
                    <Check v-if="copiedValue === picked.hex" :size="16" aria-hidden="true" />
                    <Copy v-else :size="16" aria-hidden="true" />
                    {{ copiedValue === picked.hex ? '已复制' : '复制 HEX' }}
                  </button>
                </div>
                <div
                  v-else
                  class="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-8 text-center text-sm text-[var(--text-muted)]"
                >
                  尚未选择颜色
                </div>
              </div>

              <div v-show="dominantActive" class="grid gap-3">
                <p class="text-xs leading-5 text-[var(--text-muted)]">
                  已按像素占比排序，点击颜色即可复制 HEX 值。
                </p>
                <button
                  v-for="color in palette"
                  :key="color.hex"
                  type="button"
                  class="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[var(--border)] p-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50/35 dark:hover:bg-indigo-950/20"
                  :aria-label="`复制颜色 ${color.hex}`"
                  @click="copyColor(color.hex)"
                >
                  <span
                    class="size-10 rounded-lg border border-[var(--border)] shadow-inner"
                    :style="{ backgroundColor: color.hex }"
                    aria-hidden="true"
                  />
                  <span class="min-w-0">
                    <strong class="block font-mono text-sm text-[var(--text)]">
                      {{ color.hex }}
                    </strong>
                    <small class="block truncate text-[11px] text-[var(--text-muted)]">
                      {{ color.percentage }}% · {{ color.rgb }}
                    </small>
                  </span>
                  <Check
                    v-if="copiedValue === color.hex"
                    class="text-emerald-600"
                    :size="16"
                    aria-hidden="true"
                  />
                  <Copy v-else class="text-[var(--text-muted)]" :size="16" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  </component>
</template>

<style scoped>
.image-color-canvas {
  display: block;
  width: auto;
  height: auto;
}

.image-color-canvas--picker {
  cursor: crosshair;
}
</style>
