<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconBinary, IconDownload, IconEraser } from '@tabler/icons-vue';
import FileUploader from '@/features/tools/components/FileUploader.vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { detectImageMime } from '@/features/image/core/image';
import { downloadBlob } from '@/features/image/utils/download';
import { formatBytes } from '@/features/image/utils/format';
import { base64ToImage, imageToDataUrl } from './image-base64';

const props = defineProps<{
  mode: 'encode' | 'decode';
}>();

const input = ref('');
const output = ref('');
const sourceFile = ref<File | null>(null);
const resultBlob = ref<Blob | null>(null);
const previewUrl = ref('');
const fallbackMime = ref('image/png');
const error = ref('');
const processing = ref(false);

const content = computed(() =>
  props.mode === 'encode'
    ? { inputTitle: '选择图片', outputTitle: 'Base64 Data URL' }
    : { inputTitle: '输入 Base64', outputTitle: '图片预览' },
);

function releasePreview(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

async function encode(files: File[]): Promise<void> {
  const selected = files[0];
  if (!selected) return;
  releasePreview();
  error.value = '';
  processing.value = true;
  sourceFile.value = selected;
  resultBlob.value = null;
  previewUrl.value = URL.createObjectURL(selected);
  try {
    if (!(await detectImageMime(selected))) throw new Error('无法识别图片格式。');
    output.value = await imageToDataUrl(selected);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '转换失败。';
  } finally {
    processing.value = false;
  }
}

async function decode(): Promise<void> {
  releasePreview();
  error.value = '';
  processing.value = true;
  resultBlob.value = null;
  try {
    const blob = await base64ToImage(input.value, fallbackMime.value);
    const detected = await detectImageMime(blob);
    if (!detected) throw new Error('解码结果不是可识别的图片。');
    resultBlob.value = new Blob([blob], { type: detected });
    previewUrl.value = URL.createObjectURL(resultBlob.value);
    output.value = JSON.stringify({ type: detected, size: resultBlob.value.size }, null, 2);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '图片解码失败。';
  } finally {
    processing.value = false;
  }
}

function extensionFor(mime: string): string {
  return mime === 'image/jpeg'
    ? 'jpg'
    : mime === 'image/svg+xml'
      ? 'svg'
      : mime.split('/')[1] || 'png';
}

function downloadImage(): void {
  if (!resultBlob.value) return;
  downloadBlob(resultBlob.value, `base64-image.${extensionFor(resultBlob.value.type)}`);
}

function clear(): void {
  releasePreview();
  input.value = '';
  output.value = '';
  sourceFile.value = null;
  resultBlob.value = null;
  error.value = '';
}

onBeforeUnmount(releasePreview);
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection
      :title="content.inputTitle"
      :description="
        mode === 'encode' ? '读取图片并生成完整 Data URL。' : '支持完整 Data URL 或纯 Base64。'
      "
    >
      <div v-if="mode === 'encode'" class="tool-stack">
        <FileUploader accept="image/*,.svg" :max-size="50 * 1024 * 1024" @files="encode" />
        <div v-if="sourceFile" class="tool-file-summary">
          <img :src="previewUrl" :alt="sourceFile.name" />
          <div>
            <strong>{{ sourceFile.name }}</strong
            ><span>{{ formatBytes(sourceFile.size) }}</span>
          </div>
          <button type="button" class="tool-button tool-button--danger" @click="clear">移除</button>
        </div>
      </div>
      <div v-else class="tool-stack">
        <ToolInput
          v-model="input"
          label="Base64 图片"
          placeholder="data:image/png;base64,..."
          :rows="11"
        />
        <label class="tool-field">
          <span>纯 Base64 默认格式</span>
          <select v-model="fallbackMime">
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPEG</option>
            <option value="image/webp">WebP</option>
            <option value="image/gif">GIF</option>
          </select>
        </label>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="decode">
            <IconBinary :size="16" aria-hidden="true" />解码图片
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button>
        </ToolActions>
      </div>
      <p v-if="processing" class="tool-status" role="status">正在本地转换…</p>
      <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
    </ToolSection>

    <ToolOutput
      v-if="mode === 'encode'"
      title="Base64 Data URL"
      :value="output"
      filename="image-base64.txt"
    />
    <ToolSection v-else title="图片结果" description="确认格式与大小后可下载图片。">
      <div class="tool-stack">
        <div v-if="previewUrl" class="tool-image-preview">
          <img :src="previewUrl" alt="Base64 解码预览" />
        </div>
        <div v-else class="tool-image-preview tool-image-preview--empty">
          解码后的图片将在这里显示
        </div>
        <pre v-if="output" class="tool-result-card tool-code">{{ output }}</pre>
        <button
          type="button"
          class="tool-button tool-button--primary"
          :disabled="!resultBlob"
          @click="downloadImage"
        >
          <IconDownload :size="16" aria-hidden="true" />下载图片
        </button>
      </div>
    </ToolSection>
  </div>
  <ToolHelp
    :steps="
      mode === 'encode'
        ? ['选择本地图片。', '等待生成 Base64 Data URL。', '复制或下载文本结果。']
        : ['粘贴 Data URL 或纯 Base64。', '点击解码图片。', '确认预览并下载。']
    "
  />
</template>
