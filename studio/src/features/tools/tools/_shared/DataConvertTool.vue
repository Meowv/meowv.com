<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconArrowsExchange, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { convertData, type DataConvertMode } from './data-converters';

const props = defineProps<{ mode: DataConvertMode }>();
const input = ref('');
const output = ref('');
const error = ref('');
const target = computed(() => props.mode.split('-to-')[1]);
const source = computed(() => props.mode.split('-to-')[0]);
const labels: Record<string, string> = {
  json: 'JSON',
  yaml: 'YAML',
  xml: 'XML',
  csv: 'CSV',
  toml: 'TOML',
  typescript: 'TypeScript',
  java: 'Java',
  csharp: 'C#',
};
const example = computed(() =>
  source.value === 'json'
    ? '{\n  "name": "Meowv Studio",\n  "local": true,\n  "tools": ["JSON", "Image", "PDF"]\n}'
    : source.value === 'yaml'
      ? 'name: Meowv Studio\nlocal: true\ntools:\n  - JSON\n  - Image'
      : source.value === 'xml'
        ? '<studio><name>Meowv Studio</name><local>true</local></studio>'
        : source.value === 'csv'
          ? 'name,category,status\nJSON 格式化,Developer,ready\n图片压缩,Image,ready'
          : 'name = "Meowv Studio"\nlocal = true\n\n[owner]\nname = "Meowv"',
);

function convert(): void {
  error.value = '';
  try {
    output.value = convertData(input.value, props.mode);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '格式转换失败。';
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
    <ToolSection
      :title="`${labels[source]} 输入`"
      :description="`将 ${labels[source]} 转换为 ${labels[target]}。`"
    >
      <div class="tool-stack">
        <ToolInput v-model="input" :label="`${labels[source]} 内容`" :placeholder="example" />
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="convert">
            <IconArrowsExchange :size="16" aria-hidden="true" />转换为 {{ labels[target] }}
          </button>
          <button type="button" class="tool-button tool-button--quiet" @click="input = example">
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
      :title="`${labels[target]} 结果`"
      :value="output"
      :filename="`result.${target === 'typescript' ? 'ts' : target === 'csharp' ? 'cs' : target}`"
    />
  </div>
  <ToolHelp
    :steps="[`输入有效的 ${labels[source]}。`, `转换为 ${labels[target]}。`, '复制或下载结果。']"
    note="转换过程完全在浏览器本地完成；复杂格式的注释与自定义类型不会保留。"
  />
</template>
