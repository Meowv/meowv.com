<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { IconScan } from '@tabler/icons-vue';
import jsQR from 'jsqr';
import FileUploader from '@/features/tools/components/FileUploader.vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';

const file = ref<File | null>(null);
const previewUrl = ref('');
const output = ref('');
const error = ref('');
const processing = ref(false);

function revokePreview(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

function select(files: File[]): void {
  revokePreview();
  file.value = files[0] ?? null;
  if (file.value) previewUrl.value = URL.createObjectURL(file.value);
  output.value = '';
  error.value = '';
}

async function scan(): Promise<void> {
  if (!file.value) return;
  processing.value = true;
  error.value = '';
  output.value = '';
  try {
    const bitmap = await createImageBitmap(file.value);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('无法创建图片解码画布。');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
      if (!result) throw new Error('没有识别到 QR Code，请使用清晰、完整且对比度足够的图片。');
      output.value = result.data;
    } finally {
      bitmap.close();
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '识别失败。';
  } finally {
    processing.value = false;
  }
}

onBeforeUnmount(revokePreview);
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="QR Code 识别" description="使用本地解码器识别图片，不依赖浏览器 BarcodeDetector。">
      <div class="tool-stack">
        <FileUploader accept="image/png,image/jpeg,image/webp,image/gif" @files="select" />
        <img v-if="previewUrl" class="tool-qr-reader-preview" :src="previewUrl" alt="待识别图片预览" />
        <p v-if="file" class="tool-status">{{ file.name }}</p>
        <ToolActions><button type="button" class="tool-button tool-button--primary" :disabled="!file || processing" @click="scan"><IconScan :size="16" aria-hidden="true" />{{ processing ? '识别中…' : '识别 QR Code' }}</button></ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput title="识别结果" :value="output" filename="qr-result.txt" />
  </div>
  <ToolHelp :steps="['选择包含完整 QR Code 的图片。', '在浏览器本地读取像素并解码。', '复制或下载识别结果。']" note="图片只在当前页面内存中处理，离开页面后对象 URL 会释放。" />
</template>

<style scoped>
.tool-qr-reader-preview { width: min(100%, 360px); max-height: 300px; margin: 0 auto; border: 1px solid var(--color-border); border-radius: 9px; object-fit: contain; background: #fff; }
</style>
