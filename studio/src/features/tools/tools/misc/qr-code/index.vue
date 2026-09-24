<script setup lang="ts">
import {
  IconArrowsExchange,
  IconCheck,
  IconCopy,
  IconDownload,
  IconPhoto,
} from '@tabler/icons-vue';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
type QrMode = 'generate' | 'read';

const activeMode = ref<QrMode>('generate');

const generatorInput = ref('欢迎使用 Meowv Studio 🐾');
const generatorPreviewUrl = ref('');
const generatorError = ref('');
const generatorLevel = ref<ErrorCorrectionLevel>('M');
const generatorWidth = ref(512);
const generatorProcessing = ref(false);
let generatorRequestId = 0;

async function generateQrCode(): Promise<void> {
  const requestId = ++generatorRequestId;
  const input = generatorInput.value;
  generatorError.value = '';

  if (!input) {
    generatorPreviewUrl.value = '';
    generatorProcessing.value = false;
    return;
  }

  generatorProcessing.value = true;
  try {
    const dataUrl = await QRCode.toDataURL(input, {
      errorCorrectionLevel: generatorLevel.value,
      margin: 4,
      width: generatorWidth.value,
    });
    if (requestId === generatorRequestId) generatorPreviewUrl.value = dataUrl;
  } catch (cause) {
    if (requestId !== generatorRequestId) return;
    generatorPreviewUrl.value = '';
    generatorError.value = cause instanceof Error ? cause.message : 'QR Code 生成失败。';
  } finally {
    if (requestId === generatorRequestId) generatorProcessing.value = false;
  }
}

function downloadQrCode(): void {
  if (!generatorPreviewUrl.value) return;
  const anchor = document.createElement('a');
  anchor.href = generatorPreviewUrl.value;
  anchor.download = 'meowv-studio-qr.png';
  anchor.click();
}

const readerPreviewUrl = ref('');
const readerOutput = ref('');
const readerError = ref('');
const readerProcessing = ref(false);
const readerDragging = ref(false);
const readerCopied = ref(false);
let readerRequestId = 0;
let readerCopiedTimer: number | null = null;
const MAX_READER_FILE_BYTES = 50 * 1024 * 1024;
const MAX_READER_PIXELS = 50_000_000;

function revokeReaderPreview(): void {
  if (readerPreviewUrl.value) URL.revokeObjectURL(readerPreviewUrl.value);
  readerPreviewUrl.value = '';
}

async function scanQrCode(file: File, requestId: number): Promise<void> {
  readerProcessing.value = true;
  readerError.value = '';
  readerOutput.value = '';

  try {
    if (file.size > MAX_READER_FILE_BYTES) {
      throw new Error('图片文件过大，请选择 50 MB 以内的图片。');
    }
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > MAX_READER_PIXELS) {
        throw new Error('图片像素尺寸过大，请选择较小的图片。');
      }
      const maxEdge = 2048;
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('无法创建图片解码画布。');

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(pixels.data, pixels.width, pixels.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (!result) throw new Error('没有识别到二维码，请使用清晰、完整且对比度足够的图片。');
      if (requestId === readerRequestId) readerOutput.value = result.data;
    } finally {
      bitmap.close();
    }
  } catch (cause) {
    if (requestId !== readerRequestId) return;
    readerError.value = cause instanceof Error ? cause.message : '二维码识别失败。';
  } finally {
    if (requestId === readerRequestId) readerProcessing.value = false;
  }
}

function useQrImage(file: File | null): void {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    readerError.value = '请选择二维码图片。';
    return;
  }

  const requestId = ++readerRequestId;
  revokeReaderPreview();
  readerPreviewUrl.value = URL.createObjectURL(file);
  readerCopied.value = false;
  void scanQrCode(file, requestId);
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  useQrImage(input.files?.[0] ?? null);
  input.value = '';
}

function handleDrop(event: DragEvent): void {
  readerDragging.value = false;
  useQrImage(event.dataTransfer?.files[0] ?? null);
}

function handlePaste(event: ClipboardEvent): void {
  if (activeMode.value !== 'read') return;
  const imageItem = Array.from(event.clipboardData?.items ?? []).find(
    (item) => item.kind === 'file' && item.type.startsWith('image/'),
  );
  const file = imageItem?.getAsFile() ?? null;
  if (!file) return;

  event.preventDefault();
  useQrImage(file);
}

async function copyReaderOutput(): Promise<void> {
  if (!readerOutput.value) return;
  try {
    await navigator.clipboard.writeText(readerOutput.value);
    readerCopied.value = true;
    readerError.value = '';
    if (readerCopiedTimer !== null) window.clearTimeout(readerCopiedTimer);
    readerCopiedTimer = window.setTimeout(() => {
      readerCopied.value = false;
      readerCopiedTimer = null;
    }, 1500);
  } catch {
    readerError.value = '复制失败，请手动选择识别结果复制。';
  }
}

function toggleMode(): void {
  activeMode.value = activeMode.value === 'generate' ? 'read' : 'generate';
}

watch([generatorInput, generatorLevel, generatorWidth], () => void generateQrCode(), {
  immediate: true,
});

onMounted(() => window.addEventListener('paste', handlePaste));

onBeforeUnmount(() => {
  generatorRequestId += 1;
  readerRequestId += 1;
  revokeReaderPreview();
  window.removeEventListener('paste', handlePaste);
  if (readerCopiedTimer !== null) window.clearTimeout(readerCopiedTimer);
});
</script>

<template>
  <section class="tool-section" aria-label="二维码生成与识别工作区">
    <div class="tool-section__body qr-code-tool">
      <div class="qr-code-tool__direction" aria-label="二维码工具模式">
        <strong :class="{ 'is-active': activeMode === 'generate' }">生成</strong>
        <button
          type="button"
          :title="activeMode === 'generate' ? '切换到识别' : '切换到生成'"
          :aria-label="activeMode === 'generate' ? '切换到二维码识别' : '切换到二维码生成'"
          @click="toggleMode"
        >
          <IconArrowsExchange :size="19" aria-hidden="true" />
        </button>
        <strong :class="{ 'is-active': activeMode === 'read' }">识别</strong>
      </div>

      <div v-if="activeMode === 'generate'" class="qr-code-tool__columns">
        <div class="qr-code-tool__column">
          <div class="qr-code-tool__column-header">
            <label for="qr-generator-input">编码内容</label>
            <small>{{ generatorInput.length }} 字</small>
          </div>
          <div class="qr-code-tool__generator-input">
            <textarea
              id="qr-generator-input"
              v-model="generatorInput"
              placeholder="输入文本、网址或联系方式…"
            ></textarea>
            <div class="qr-code-tool__options">
              <label>
                <span>容错级别</span>
                <select v-model="generatorLevel">
                  <option value="L">L · 约 7%</option>
                  <option value="M">M · 约 15%</option>
                  <option value="Q">Q · 约 25%</option>
                  <option value="H">H · 约 30%</option>
                </select>
              </label>
              <label>
                <span>PNG 尺寸</span>
                <select v-model.number="generatorWidth">
                  <option :value="256">256 × 256</option>
                  <option :value="512">512 × 512</option>
                  <option :value="1024">1024 × 1024</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div class="qr-code-tool__column">
          <div class="qr-code-tool__column-header">
            <span>二维码</span>
            <small>内容变化时自动生成</small>
          </div>
          <div class="qr-code-tool__preview">
            <img v-if="generatorPreviewUrl" :src="generatorPreviewUrl" alt="生成的二维码预览" />
            <span v-else class="qr-code-tool__empty">
              {{ generatorProcessing ? '正在生成二维码…' : '输入内容后自动生成二维码' }}
            </span>
            <button
              type="button"
              class="qr-code-tool__corner-button"
              :disabled="!generatorPreviewUrl"
              title="下载 PNG"
              aria-label="下载二维码 PNG"
              @click="downloadQrCode"
            >
              <IconDownload :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div v-else class="qr-code-tool__columns">
        <div class="qr-code-tool__column">
          <div class="qr-code-tool__column-header">
            <span>二维码图片</span>
            <small>上传、拖拽或粘贴</small>
          </div>
          <label
            class="qr-code-tool__dropzone"
            :class="{ 'is-dragging': readerDragging, 'has-image': readerPreviewUrl }"
            @dragenter.prevent="readerDragging = true"
            @dragover.prevent="readerDragging = true"
            @dragleave.prevent="readerDragging = false"
            @drop.prevent="handleDrop"
          >
            <input
              class="tool-visually-hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              @change="handleFileChange"
            />
            <img v-if="readerPreviewUrl" :src="readerPreviewUrl" alt="待识别的二维码图片" />
            <span v-else class="qr-code-tool__dropzone-empty">
              <IconPhoto :size="30" aria-hidden="true" />
              <strong>拖拽或点击选择二维码图片</strong>
              <small>也可以直接按 Ctrl / Command + V 粘贴</small>
            </span>
            <small v-if="readerPreviewUrl" class="qr-code-tool__replace-hint">
              {{ readerProcessing ? '正在自动识别…' : '点击、拖拽或粘贴可更换图片' }}
            </small>
          </label>
        </div>

        <div class="qr-code-tool__column">
          <div class="qr-code-tool__column-header">
            <label for="qr-reader-output">识别结果</label>
            <small>图片选定后自动识别</small>
          </div>
          <div class="qr-code-tool__result">
            <textarea
              id="qr-reader-output"
              :value="readerOutput"
              :placeholder="readerProcessing ? '正在识别二维码…' : '识别内容将显示在这里…'"
              readonly
            ></textarea>
            <button
              type="button"
              class="qr-code-tool__corner-button"
              :class="{ 'is-copied': readerCopied }"
              :disabled="!readerOutput"
              :title="readerCopied ? '已复制' : '复制识别结果'"
              :aria-label="readerCopied ? '识别结果已复制' : '复制识别结果'"
              @click="copyReaderOutput"
            >
              <IconCheck v-if="readerCopied" :size="16" aria-hidden="true" />
              <IconCopy v-else :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <p
        v-if="activeMode === 'generate' && generatorError"
        class="tool-status tool-status--error"
        role="alert"
      >
        {{ generatorError }}
      </p>
      <p
        v-if="activeMode === 'read' && readerError"
        class="tool-status tool-status--error"
        role="alert"
      >
        {{ readerError }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.qr-code-tool {
  display: grid;
  gap: 14px;
}

.qr-code-tool__direction {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.qr-code-tool__direction strong {
  min-width: 78px;
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
  transition: color 150ms ease;
}

.qr-code-tool__direction strong.is-active {
  color: var(--tools-accent);
}

.qr-code-tool__direction button,
.qr-code-tool__corner-button {
  display: inline-flex;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-solid);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    color 150ms ease,
    transform 180ms ease;
}

.qr-code-tool__direction button:hover,
.qr-code-tool__direction button:focus-visible {
  border-color: var(--tools-accent);
  outline: none;
  color: var(--tools-accent);
  transform: rotate(180deg);
}

.qr-code-tool__columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 12px;
}

.qr-code-tool__column {
  display: grid;
  min-width: 0;
  grid-template-rows: auto minmax(300px, 1fr);
  gap: 7px;
}

.qr-code-tool__column-header {
  display: flex;
  min-height: 18px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.qr-code-tool__column-header > label,
.qr-code-tool__column-header > span {
  color: var(--color-text);
  font-size: 11px;
  font-weight: 700;
}

.qr-code-tool__column-header > small {
  color: var(--color-text-muted);
  font-size: 9px;
}

.qr-code-tool__generator-input {
  display: grid;
  min-height: 300px;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 10px;
}

.qr-code-tool__generator-input textarea,
.qr-code-tool__result textarea {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  outline: none;
  resize: none;
  background: var(--color-surface-solid);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  line-height: 1.7;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.qr-code-tool__generator-input textarea:focus,
.qr-code-tool__result textarea:focus {
  border-color: color-mix(in srgb, var(--tools-accent) 52%, var(--color-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 9%, transparent);
}

.qr-code-tool__options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.qr-code-tool__options label {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.qr-code-tool__options span {
  color: var(--color-text);
  font-size: 10px;
  font-weight: 700;
}

.qr-code-tool__options select {
  width: 100%;
  min-height: 38px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  outline: none;
  background: var(--color-surface-solid);
  color: var(--color-text);
  font: inherit;
  font-size: 11px;
}

.qr-code-tool__options select:focus {
  border-color: color-mix(in srgb, var(--tools-accent) 52%, var(--color-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 9%, transparent);
}

.qr-code-tool__preview,
.qr-code-tool__result,
.qr-code-tool__dropzone {
  position: relative;
  display: flex;
  min-height: 300px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.qr-code-tool__preview {
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #fff;
}

.qr-code-tool__preview img {
  width: min(76%, 280px);
  height: auto;
  image-rendering: pixelated;
}

.qr-code-tool__empty {
  padding: 20px;
  color: var(--color-text-muted);
  font-size: 11px;
  text-align: center;
}

.qr-code-tool__corner-button {
  position: absolute;
  z-index: 1;
  top: 9px;
  right: 9px;
  width: 30px;
  height: 30px;
}

.qr-code-tool__corner-button:hover:not(:disabled),
.qr-code-tool__corner-button:focus-visible:not(:disabled),
.qr-code-tool__corner-button.is-copied {
  border-color: var(--tools-accent);
  outline: none;
  background: var(--tools-accent);
  color: #fff;
}

.qr-code-tool__corner-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.qr-code-tool__dropzone {
  overflow: hidden;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-surface-soft) 72%, var(--color-surface-solid));
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    box-shadow 150ms ease;
}

.qr-code-tool__dropzone:hover,
.qr-code-tool__dropzone:focus-within,
.qr-code-tool__dropzone.is-dragging {
  border-color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 6%, var(--color-surface-solid));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 9%, transparent);
}

.qr-code-tool__dropzone > img {
  width: 100%;
  height: 100%;
  max-height: 300px;
  padding: 18px;
  object-fit: contain;
  background: #fff;
}

.qr-code-tool__dropzone-empty {
  display: grid;
  padding: 24px;
  place-items: center;
  gap: 8px;
  color: var(--color-text-muted);
  text-align: center;
}

.qr-code-tool__dropzone-empty svg {
  color: var(--tools-accent);
}

.qr-code-tool__dropzone-empty strong {
  color: var(--color-text);
  font-size: 11px;
}

.qr-code-tool__dropzone-empty small,
.qr-code-tool__replace-hint {
  font-size: 9px;
  font-weight: 500;
}

.qr-code-tool__replace-hint {
  position: absolute;
  right: 10px;
  bottom: 10px;
  left: 10px;
  color: var(--color-text-muted);
  text-align: center;
}

.qr-code-tool__result {
  min-width: 0;
}

.qr-code-tool__result textarea {
  padding-right: 42px;
  background: color-mix(in srgb, var(--color-surface-soft) 72%, var(--color-surface-solid));
}

@media (max-width: 640px) {
  .qr-code-tool__columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .qr-code-tool__column {
    grid-template-rows: auto minmax(240px, auto);
  }

  .qr-code-tool__generator-input,
  .qr-code-tool__preview,
  .qr-code-tool__result,
  .qr-code-tool__dropzone {
    min-height: 240px;
  }

  .qr-code-tool__options {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .qr-code-tool__direction strong,
  .qr-code-tool__direction button,
  .qr-code-tool__corner-button,
  .qr-code-tool__dropzone {
    transition: none;
  }
}
</style>
