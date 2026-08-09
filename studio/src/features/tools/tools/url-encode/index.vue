<script setup lang="ts">
import { ref } from 'vue';
import { IconLink, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { encodeUrlComponent } from './utils';

const input = ref('');
const output = ref('');

function clear(): void {
  input.value = '';
  output.value = '';
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="输入 URL 内容" description="按 URL 组件规则编码保留字符、中文和空格。">
      <div class="tool-stack">
        <ToolInput v-model="input" label="待编码内容" placeholder="例如：关键词=本地工具" />
        <ToolActions>
          <button
            type="button"
            class="tool-button tool-button--primary"
            @click="output = encodeUrlComponent(input)"
          >
            <IconLink :size="16" aria-hidden="true" />
            URL 编码
          </button>
          <button
            type="button"
            class="tool-button tool-button--quiet"
            @click="input = '关键词=Meowv Studio 本地工具'"
          >
            使用示例
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />
            清空
          </button>
        </ToolActions>
      </div>
    </ToolSection>
    <ToolOutput title="编码结果" :value="output" filename="url-encoded.txt" />
  </div>
  <ToolHelp
    :steps="['输入 URL 参数值或文本片段。', '点击 URL 编码。', '复制编码结果用于链接或请求参数。']"
  />
</template>
