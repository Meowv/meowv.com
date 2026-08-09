<script setup lang="ts">
import { ref } from 'vue';
import { IconEraser, IconFileDescription } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { generateApiDoc } from './api-doc';

const example = JSON.stringify(
  {
    title: '获取工具详情',
    description: '根据工具 ID 返回配置与状态。',
    method: 'GET',
    path: '/api/tools/:id',
    headers: { Authorization: 'Bearer TOKEN' },
    query: { locale: 'zh-CN' },
    response: { id: 'json-format', name: 'JSON 格式化', ready: true },
  },
  null,
  2,
);
const input = ref('');
const output = ref('');
const error = ref('');
function generate(): void {
  error.value = '';
  try {
    output.value = generateApiDoc(input.value);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '文档生成失败。';
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
    <ToolSection title="接口定义" description="支持单个接口对象或接口对象数组。">
      <div class="tool-stack">
        <ToolInput v-model="input" label="JSON 定义" :placeholder="example" />
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="generate">
            <IconFileDescription :size="16" aria-hidden="true" />生成文档
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
      title="Markdown 接口文档"
      :value="output"
      filename="api-documentation.md"
      mime-type="text/markdown;charset=utf-8"
    />
  </div>
  <ToolHelp :steps="['输入接口 JSON 定义。', '生成 Markdown 文档。', '复制或下载并继续编辑。']" />
</template>
