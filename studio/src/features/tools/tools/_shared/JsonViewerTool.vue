<script setup lang="ts">
import { ref } from 'vue';
import { IconEraser, IconHierarchy } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import JsonTreeNode from './JsonTreeNode.vue';
import { parseJsonInput } from './json-advanced';
defineProps<{ mode: 'tree' | 'graph' }>();
const input = ref('');
const value = ref<unknown>();
const error = ref('');
const sample =
  '{\n  "studio": {\n    "local": true,\n    "tools": ["JSON", "Image", "PDF"]\n  }\n}';
function render(): void {
  error.value = '';
  try {
    value.value = parseJsonInput(input.value);
  } catch (cause) {
    value.value = undefined;
    error.value = cause instanceof Error ? cause.message : 'JSON 解析失败。';
  }
}
function clear(): void {
  input.value = '';
  value.value = undefined;
  error.value = '';
}
</script>
<template>
  <div class="tool-workspace-grid">
    <ToolSection
      title="JSON 内容"
      :description="mode === 'tree' ? '展开或折叠节点查看层级。' : '以层级连线呈现数据关系。'"
    >
      <div class="tool-stack">
        <ToolInput v-model="input" label="JSON" :placeholder="sample" /><ToolActions
          ><button type="button" class="tool-button tool-button--primary" @click="render">
            <IconHierarchy :size="16" aria-hidden="true" />生成视图</button
          ><button type="button" class="tool-button tool-button--quiet" @click="input = sample">
            使用示例</button
          ><button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button></ToolActions
        >
        <p v-if="error" class="tool-status tool-status--error">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolSection :title="mode === 'tree' ? '树形结构' : '关系图谱'" tone="output"
      ><div class="tool-json-view">
        <JsonTreeNode
          v-if="value !== undefined"
          label="$"
          :value="value"
          :graph="mode === 'graph'"
        />
        <p v-else>视图将在这里显示</p>
      </div></ToolSection
    >
  </div>
  <ToolHelp :steps="['输入有效 JSON。', '生成结构视图。', '展开节点检查数据。']" />
</template>
