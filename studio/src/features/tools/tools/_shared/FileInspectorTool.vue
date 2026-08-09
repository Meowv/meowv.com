<script setup lang="ts">
import { ref } from 'vue';
import { IconFileAnalytics, IconHash } from '@tabler/icons-vue';
import FileUploader from '@/features/tools/components/FileUploader.vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { formatBytes } from '@/features/image/utils/format';
import { md5Bytes } from './hash';
import { bytesToHex } from './security-crypto';
const props = defineProps<{ mode: 'info' | 'hash' }>();
const file = ref<File | null>(null);
const output = ref('');
const error = ref('');
const processing = ref(false);
function select(files: File[]): void {
  file.value = files[0] ?? null;
  output.value = '';
  error.value = '';
}
async function inspect(): Promise<void> {
  if (!file.value) return;
  processing.value = true;
  error.value = '';
  try {
    const details: Record<string, unknown> = {
      name: file.value.name,
      size: file.value.size,
      formattedSize: formatBytes(file.value.size),
      type: file.value.type || 'application/octet-stream',
      lastModified: new Date(file.value.lastModified).toISOString(),
      extension: file.value.name.includes('.')
        ? file.value.name.split('.').pop()?.toLowerCase()
        : '',
    };
    if (props.mode === 'hash') {
      const bytes = new Uint8Array(await file.value.arrayBuffer());
      details.md5 = md5Bytes(bytes);
      details.sha256 = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
      details.sha512 = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-512', bytes)));
    }
    output.value = JSON.stringify(details, null, 2);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '文件分析失败。';
  } finally {
    processing.value = false;
  }
}
</script>
<template>
  <div class="tool-workspace-grid">
    <ToolSection
      :title="mode === 'info' ? '文件信息查看' : '文件 Hash 校验'"
      description="文件只在浏览器内存中读取，不会上传。"
      ><div class="tool-stack">
        <FileUploader @files="select" />
        <p v-if="file" class="tool-status">{{ file.name }} · {{ formatBytes(file.size) }}</p>
        <ToolActions
          ><button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="!file || processing"
            @click="inspect"
          >
            <IconHash v-if="mode === 'hash'" :size="16" aria-hidden="true" /><IconFileAnalytics
              v-else
              :size="16"
              aria-hidden="true"
            />{{ processing ? '处理中…' : mode === 'hash' ? '计算摘要' : '读取信息' }}
          </button></ToolActions
        >
        <p v-if="error" class="tool-status tool-status--error">{{ error }}</p>
      </div></ToolSection
    ><ToolOutput
      title="文件分析结果"
      :value="output"
      filename="file-info.json"
      mime-type="application/json;charset=utf-8"
    />
  </div>
  <ToolHelp
    :steps="['选择本地文件。', '读取元数据或计算摘要。', '复制或下载结果。']"
    note="大文件计算摘要会占用相应内存；文件内容不会离开浏览器。"
  />
</template>
