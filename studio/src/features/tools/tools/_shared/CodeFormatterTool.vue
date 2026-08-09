<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconEraser, IconWand } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { formatCode, type FormatterMode } from './code-formatters';

const props = defineProps<{ mode: FormatterMode }>();
const input = ref('');
const output = ref('');
const processing = ref(false);
const error = ref('');
const examples: Record<FormatterMode, string> = {
  javascript: 'const tools=["JSON","Image"];function ready(value){return value?.length>0}',
  typescript: 'interface Tool{id:string;ready:boolean}const tool:Tool={id:"json",ready:true}',
  css: '.tool{display:grid;color:#5a9600}@media(max-width:600px){.tool{display:block}}',
  html: '<main><h1>Meowv Studio</h1><p>Local tools</p></main>',
  sql: "select id,name from tools where ready=true and category='developer' order by name;",
  xml: '<studio><tool id="json"><ready>true</ready></tool></studio>',
  yaml: 'studio: {name: Meowv Studio, local: true}\ntools: [JSON, Image, PDF]',
  markdown: '# Meowv Studio\n- JSON\n- Image\n\n**Local tools**',
};
const labels: Record<FormatterMode, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  css: 'CSS',
  html: 'HTML',
  sql: 'SQL',
  xml: 'XML',
  yaml: 'YAML',
  markdown: 'Markdown',
};
const label = computed(() => labels[props.mode]);

async function format(): Promise<void> {
  processing.value = true;
  error.value = '';
  try {
    output.value = await formatCode(input.value, props.mode);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '格式化失败。';
  } finally {
    processing.value = false;
  }
}
function clear(): void {
  input.value = '';
  output.value = '';
  error.value = '';
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="`${label} 源码`" description="格式化依赖仅在打开当前工具时加载。">
      <div class="tool-stack">
        <ToolInput v-model="input" :label="`${label} 内容`" :placeholder="examples[mode]" />
        <ToolActions>
          <button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="processing"
            @click="format"
          >
            <IconWand :size="16" aria-hidden="true" />{{ processing ? '格式化中…' : '格式化' }}
          </button>
          <button
            type="button"
            class="tool-button tool-button--quiet"
            @click="input = examples[mode]"
          >
            使用示例
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput
      :title="`${label} 格式化结果`"
      :value="output"
      :filename="`formatted.${mode === 'javascript' ? 'js' : mode === 'typescript' ? 'ts' : mode === 'markdown' ? 'md' : mode}`"
    />
  </div>
  <ToolHelp
    :steps="[`输入有效的 ${label}。`, '点击格式化。', '复制或下载结果。']"
    note="JavaScript、TypeScript、CSS、HTML、YAML 和 Markdown 使用 Prettier；SQL 与 XML 使用本地轻量格式化器。"
  />
</template>
