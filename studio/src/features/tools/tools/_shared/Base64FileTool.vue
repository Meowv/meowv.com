<script setup lang="ts">
import { ref } from 'vue';
import { IconBinary, IconDownload, IconEraser } from '@tabler/icons-vue';
import FileUploader from '@/features/tools/components/FileUploader.vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { downloadBlob } from '@/features/image/utils/download';
import { formatBytes } from '@/features/image/utils/format';
import { dataUrlToBlob, fileToDataUrl } from './file-base64';

const input = ref('');
const output = ref('');
const file = ref<File | null>(null);
const result = ref<Blob | null>(null);
const filename = ref('decoded-file.bin');
const fallbackMime = ref('application/octet-stream');
const error = ref('');

async function encode(files: File[]): Promise<void> {
  const selected = files[0];
  if (!selected) return;
  file.value = selected;
  result.value = null;
  error.value = '';
  output.value = await fileToDataUrl(selected);
}

function decode(): void {
  error.value = '';
  result.value = null;
  try {
    result.value = dataUrlToBlob(input.value, fallbackMime.value);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '文件解码失败。';
  }
}

function clear(): void {
  input.value = '';
  output.value = '';
  file.value = null;
  result.value = null;
  error.value = '';
}

function download(): void {
  if (result.value) downloadBlob(result.value, filename.value.trim() || 'decoded-file.bin');
}
</script>

<template>
  <div class="tool-workspace-grid">
    <div class="tool-stack">
      <ToolSection title="文件转 Base64" description="选择任意本地文件生成 Data URL。">
        <div class="tool-stack">
          <FileUploader :max-size="100 * 1024 * 1024" @files="encode" />
          <p v-if="file" class="tool-status">{{ file.name }} · {{ formatBytes(file.size) }}</p>
        </div>
      </ToolSection>
      <ToolOutput title="文件 Base64" :value="output" filename="file-base64.txt" :rows="8" />
    </div>
    <ToolSection title="Base64 转文件" description="支持完整 Data URL 或纯 Base64。">
      <div class="tool-stack">
        <ToolInput
          v-model="input"
          label="Base64 内容"
          placeholder="data:application/pdf;base64,..."
        />
        <label class="tool-field"
          ><span>纯 Base64 MIME</span><input v-model="fallbackMime"
        /></label>
        <label class="tool-field"><span>下载文件名</span><input v-model="filename" /></label>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="decode">
            <IconBinary :size="16" aria-hidden="true" />解码文件
          </button>
          <button
            type="button"
            class="tool-button tool-button--quiet"
            :disabled="!result"
            @click="download"
          >
            <IconDownload :size="16" aria-hidden="true" />下载文件
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button>
        </ToolActions>
        <p v-if="result" class="tool-status">已解码 {{ formatBytes(result.size) }}。</p>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
  </div>
  <ToolHelp
    :steps="[
      '选择文件生成 Base64，或粘贴 Base64。',
      '设置 MIME 与下载文件名。',
      '解码并下载文件。',
    ]"
    note="大文件的 Base64 会占用较多内存；建议控制在 100 MB 以内。"
  />
</template>
