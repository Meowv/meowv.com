<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconDownload, IconEraser, IconFileTypePdf, IconSparkles } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { renderMarkdown, sanitizeMarkdownHtml } from '@/features/markdown/services/markdown';
import { createPdfExport } from '@/features/markdown/services/export';
import { downloadBlob } from '@/features/image/utils/download';
import { formatBytes } from '@/features/image/utils/format';
import { htmlToMarkdown } from './html-markdown';
const props = defineProps<{ mode: 'markdown-to-html' | 'html-to-markdown' | 'markdown-to-pdf' }>();
const input = ref('');
const output = ref('');
const pdf = ref<Blob | null>(null);
const processing = ref(false);
const error = ref('');
const sourceLabel = computed(() => (props.mode === 'html-to-markdown' ? 'HTML' : 'Markdown'));
const targetLabel = computed(() =>
  props.mode === 'markdown-to-html'
    ? 'HTML'
    : props.mode === 'html-to-markdown'
      ? 'Markdown'
      : 'PDF',
);
const example = computed(() =>
  props.mode === 'html-to-markdown'
    ? '<h1>Meowv Studio</h1><p>浏览器本地 <strong>工具工作台</strong>。</p><ul><li>JSON</li><li>Image</li></ul>'
    : '# Meowv Studio\n\n浏览器本地 **工具工作台**。\n\n- JSON\n- Image\n- PDF',
);
function convert(): void {
  error.value = '';
  pdf.value = null;
  try {
    output.value =
      props.mode === 'html-to-markdown'
        ? htmlToMarkdown(input.value)
        : sanitizeMarkdownHtml(renderMarkdown(input.value));
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '转换失败。';
  }
}
async function generatePdf(): Promise<void> {
  convert();
  if (!output.value) return;
  processing.value = true;
  try {
    pdf.value = (
      await createPdfExport(output.value, {
        filename: 'markdown-document.pdf',
        title: 'Markdown Document',
      })
    ).blob;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'PDF 生成失败。';
  } finally {
    processing.value = false;
  }
}
function clear(): void {
  input.value = '';
  output.value = '';
  pdf.value = null;
  error.value = '';
}
</script>
<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="`${sourceLabel} 输入`" :description="`在浏览器本地转换为 ${targetLabel}。`"
      ><div class="tool-stack">
        <ToolInput v-model="input" :label="sourceLabel" :placeholder="example" /><ToolActions
          ><button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="processing"
            @click="mode === 'markdown-to-pdf' ? generatePdf() : convert()"
          >
            <IconFileTypePdf
              v-if="mode === 'markdown-to-pdf'"
              :size="16"
              aria-hidden="true"
            /><IconSparkles v-else :size="16" aria-hidden="true" />{{
              processing ? '生成中…' : `转换为 ${targetLabel}`
            }}</button
          ><button type="button" class="tool-button tool-button--quiet" @click="input = example">
            使用示例</button
          ><button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button></ToolActions
        >
        <p v-if="error" class="tool-status tool-status--error">{{ error }}</p>
      </div></ToolSection
    >
    <ToolOutput
      v-if="mode !== 'markdown-to-pdf'"
      :title="`${targetLabel} 结果`"
      :value="output"
      :filename="mode === 'markdown-to-html' ? 'result.html' : 'result.md'"
    />
    <ToolSection v-else title="PDF 预览与下载" tone="output"
      ><div class="tool-stack">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="tool-markdown-preview" v-html="output"></div>
        <p v-if="pdf" class="tool-status">已生成 PDF，大小 {{ formatBytes(pdf.size) }}。</p>
        <button
          type="button"
          class="tool-button tool-button--primary"
          :disabled="!pdf"
          @click="pdf && downloadBlob(pdf, 'markdown-document.pdf')"
        >
          <IconDownload :size="16" aria-hidden="true" />下载 PDF
        </button>
      </div></ToolSection
    >
  </div>
  <ToolHelp
    :steps="[`输入有效的 ${sourceLabel}。`, `转换为 ${targetLabel}。`, '核对并复制或下载结果。']"
    note="HTML 会经过安全清理；PDF 由当前页面在本地渲染。"
  />
</template>
