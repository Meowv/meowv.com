<script setup lang="ts">
import { IconDownload, IconQrcode, IconScan } from '@tabler/icons-vue';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { onBeforeUnmount, ref } from 'vue';
import FileUploader from '@/features/tools/components/FileUploader.vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

const activeMode = ref<'generate' | 'read'>('generate');

const generatorInput = ref('欢迎使用 Meowv Studio 🐾');
const generatorOutput = ref('');
const generatorPreviewUrl = ref('');
const generatorError = ref('');
const generatorLevel = ref<ErrorCorrectionLevel>('M');
const generatorWidth = ref(512);

async function generateQrCode(): Promise<void> {
  generatorError.value = '';
  if (!generatorInput.value) {
    generatorOutput.value = '';
    generatorPreviewUrl.value = '';
    generatorError.value = '请输入要编码的内容。';
    return;
  }
  try {
    const options = {
      errorCorrectionLevel: generatorLevel.value,
      margin: 4,
      width: generatorWidth.value,
    };
    const [svg, dataUrl] = await Promise.all([
      QRCode.toString(generatorInput.value, { ...options, type: 'svg' }),
      QRCode.toDataURL(generatorInput.value, options),
    ]);
    generatorOutput.value = svg;
    generatorPreviewUrl.value = dataUrl;
  } catch (cause) {
    generatorOutput.value = '';
    generatorPreviewUrl.value = '';
    generatorError.value = cause instanceof Error ? cause.message : 'QR Code 生成失败。';
  }
}

function downloadQrCode(): void {
  if (!generatorPreviewUrl.value) return;
  const anchor = document.createElement('a');
  anchor.href = generatorPreviewUrl.value;
  anchor.download = 'meowv-studio-qr.png';
  anchor.click();
}

const readerFile = ref<File | null>(null);
const readerPreviewUrl = ref('');
const readerOutput = ref('');
const readerError = ref('');
const readerProcessing = ref(false);

function revokeReaderPreview(): void {
  if (readerPreviewUrl.value) URL.revokeObjectURL(readerPreviewUrl.value);
  readerPreviewUrl.value = '';
}

function selectQrImage(files: File[]): void {
  revokeReaderPreview();
  readerFile.value = files[0] ?? null;
  if (readerFile.value) readerPreviewUrl.value = URL.createObjectURL(readerFile.value);
  readerOutput.value = '';
  readerError.value = '';
}

async function scanQrCode(): Promise<void> {
  if (!readerFile.value) return;
  readerProcessing.value = true;
  readerError.value = '';
  readerOutput.value = '';
  try {
    const bitmap = await createImageBitmap(readerFile.value);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('无法创建图片解码画布。');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(pixels.data, pixels.width, pixels.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (!result) throw new Error('没有识别到 QR Code，请使用清晰、完整且对比度足够的图片。');
      readerOutput.value = result.data;
    } finally {
      bitmap.close();
    }
  } catch (cause) {
    readerError.value = cause instanceof Error ? cause.message : '识别失败。';
  } finally {
    readerProcessing.value = false;
  }
}

onBeforeUnmount(() => {
  generatorPreviewUrl.value = '';
  revokeReaderPreview();
});

void generateQrCode();
</script>

<template>
  <div class="qr-code-tool">
    <div class="qr-code-tool__tabs" role="tablist" aria-label="QR Code 功能">
      <button
        type="button"
        role="tab"
        :aria-selected="activeMode === 'generate'"
        :class="{ 'is-active': activeMode === 'generate' }"
        @click="activeMode = 'generate'"
      >
        生成
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeMode === 'read'"
        :class="{ 'is-active': activeMode === 'read' }"
        @click="activeMode = 'read'"
      >
        识别
      </button>
    </div>

    <div v-show="activeMode === 'generate'" class="tool-workspace-grid">
      <ToolSection
        title="QR Code 生成器"
        description="离线生成支持中文、Emoji 与长文本的标准 QR Code。"
      >
        <div class="tool-stack">
          <ToolInput
            v-model="generatorInput"
            label="编码内容"
            :rows="7"
            placeholder="文本、网址、联系方式…"
          />
          <div class="tool-form-grid tool-form-grid--two">
            <label class="tool-field">
              <span>容错级别</span>
              <select v-model="generatorLevel">
                <option value="L">L · 约 7%</option>
                <option value="M">M · 约 15%</option>
                <option value="Q">Q · 约 25%</option>
                <option value="H">H · 约 30%</option>
              </select>
            </label>
            <label class="tool-field">
              <span>PNG 尺寸</span>
              <select v-model.number="generatorWidth">
                <option :value="256">256 × 256</option>
                <option :value="512">512 × 512</option>
                <option :value="1024">1024 × 1024</option>
              </select>
            </label>
          </div>
          <ToolActions>
            <button type="button" class="tool-button tool-button--primary" @click="generateQrCode">
              <IconQrcode :size="16" aria-hidden="true" />生成
            </button>
            <button
              type="button"
              class="tool-button tool-button--secondary"
              :disabled="!generatorPreviewUrl"
              @click="downloadQrCode"
            >
              <IconDownload :size="16" aria-hidden="true" />下载 PNG
            </button>
          </ToolActions>
          <p v-if="generatorError" class="tool-status tool-status--error" role="alert">
            {{ generatorError }}
          </p>
          <div v-if="generatorPreviewUrl" class="tool-qr-preview-card">
            <img :src="generatorPreviewUrl" alt="生成的 QR Code 预览" />
          </div>
        </div>
      </ToolSection>
      <ToolOutput
        title="SVG 源码"
        :value="generatorOutput"
        filename="meowv-studio-qr.svg"
        mime-type="image/svg+xml;charset=utf-8"
      />
    </div>

    <div v-show="activeMode === 'read'" class="tool-workspace-grid">
      <ToolSection
        title="QR Code 识别"
        description="使用本地解码器识别图片，不依赖浏览器 BarcodeDetector。"
      >
        <div class="tool-stack">
          <FileUploader accept="image/png,image/jpeg,image/webp,image/gif" @files="selectQrImage" />
          <img
            v-if="readerPreviewUrl"
            class="tool-qr-reader-preview"
            :src="readerPreviewUrl"
            alt="待识别图片预览"
          />
          <p v-if="readerFile" class="tool-status">{{ readerFile.name }}</p>
          <ToolActions>
            <button
              type="button"
              class="tool-button tool-button--primary"
              :disabled="!readerFile || readerProcessing"
              @click="scanQrCode"
            >
              <IconScan :size="16" aria-hidden="true" />{{
                readerProcessing ? '识别中…' : '识别 QR Code'
              }}
            </button>
          </ToolActions>
          <p v-if="readerError" class="tool-status tool-status--error" role="alert">
            {{ readerError }}
          </p>
        </div>
      </ToolSection>
      <ToolOutput title="识别结果" :value="readerOutput" filename="qr-result.txt" />
    </div>
  </div>
</template>

<style scoped>
.qr-code-tool {
  display: grid;
  gap: 16px;
}

.qr-code-tool__tabs {
  display: inline-flex;
  justify-self: start;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.qr-code-tool__tabs button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-right: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.qr-code-tool__tabs button:last-child {
  border-right: 0;
}

.qr-code-tool__tabs button.is-active {
  background: var(--tools-accent);
  color: #fff;
}

.tool-qr-preview-card {
  display: grid;
  min-height: 250px;
  padding: 18px;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: #fff;
}

.tool-qr-preview-card img {
  width: min(100%, 310px);
  height: auto;
  image-rendering: pixelated;
}

.tool-qr-reader-preview {
  width: min(100%, 360px);
  max-height: 300px;
  margin: 0 auto;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  object-fit: contain;
  background: #fff;
}
</style>
