<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { IconDownload, IconQrcode } from '@tabler/icons-vue';
import QRCode from 'qrcode';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

const input = ref('欢迎使用 Meowv Studio 🐾');
const output = ref('');
const previewUrl = ref('');
const error = ref('');
const level = ref<ErrorCorrectionLevel>('M');
const width = ref(512);

async function generate(): Promise<void> {
  error.value = '';
  if (!input.value) {
    output.value = '';
    previewUrl.value = '';
    error.value = '请输入要编码的内容。';
    return;
  }
  try {
    const options = { errorCorrectionLevel: level.value, margin: 4, width: width.value };
    const [svg, dataUrl] = await Promise.all([
      QRCode.toString(input.value, { ...options, type: 'svg' }),
      QRCode.toDataURL(input.value, options),
    ]);
    output.value = svg;
    previewUrl.value = dataUrl;
  } catch (cause) {
    output.value = '';
    previewUrl.value = '';
    error.value = cause instanceof Error ? cause.message : 'QR Code 生成失败。';
  }
}

function downloadPng(): void {
  if (!previewUrl.value) return;
  const anchor = document.createElement('a');
  anchor.href = previewUrl.value;
  anchor.download = 'meowv-studio-qr.png';
  anchor.click();
}

onBeforeUnmount(() => {
  previewUrl.value = '';
});

void generate();
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection
      title="QR Code 生成器"
      description="离线生成支持中文、Emoji 与长文本的标准 QR Code。"
    >
      <div class="tool-stack">
        <ToolInput v-model="input" label="编码内容" :rows="7" placeholder="文本、网址、联系方式…" />
        <div class="tool-form-grid tool-form-grid--two">
          <label class="tool-field"
            ><span>容错级别</span
            ><select v-model="level">
              <option value="L">L · 约 7%</option>
              <option value="M">M · 约 15%</option>
              <option value="Q">Q · 约 25%</option>
              <option value="H">H · 约 30%</option>
            </select></label
          >
          <label class="tool-field"
            ><span>PNG 尺寸</span
            ><select v-model.number="width">
              <option :value="256">256 × 256</option>
              <option :value="512">512 × 512</option>
              <option :value="1024">1024 × 1024</option>
            </select></label
          >
        </div>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="generate">
            <IconQrcode :size="16" aria-hidden="true" />生成
          </button>
          <button
            type="button"
            class="tool-button tool-button--secondary"
            :disabled="!previewUrl"
            @click="downloadPng"
          >
            <IconDownload :size="16" aria-hidden="true" />下载 PNG
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
        <div v-if="previewUrl" class="tool-qr-preview-card">
          <img :src="previewUrl" alt="生成的 QR Code 预览" />
        </div>
      </div>
    </ToolSection>
    <ToolOutput
      title="SVG 源码"
      :value="output"
      filename="meowv-studio-qr.svg"
      mime-type="image/svg+xml;charset=utf-8"
    />
  </div>
  <ToolHelp
    :steps="[
      '输入文本、网址或联系方式。',
      '按使用场景选择容错级别与图片尺寸。',
      '生成后下载 PNG 或复制 SVG。',
    ]"
    note="编码过程完全在浏览器本地完成；内容不会发送到服务器。"
  />
</template>

<style scoped>
.tool-qr-preview-card {
  display: grid;
  min-height: 250px;
  place-items: center;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: #fff;
}
.tool-qr-preview-card img {
  width: min(100%, 310px);
  height: auto;
  image-rendering: pixelated;
}
</style>
