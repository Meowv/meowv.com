<script setup lang="ts">
import { ref } from 'vue';
import { IconBinary, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { encodeBase64 } from './utils';

const input = ref('');
const output = ref('');

function encode(): void {
  output.value = encodeBase64(input.value);
}

function clear(): void {
  input.value = '';
  output.value = '';
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="输入文本" description="使用 UTF-8 处理中文、Emoji 与多语言文本。">
      <div class="tool-stack">
        <ToolInput v-model="input" label="原始文本" placeholder="例如：Meowv Studio 本地工具 🚀" />
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="encode">
            <IconBinary :size="16" aria-hidden="true" />
            Base64 编码
          </button>
          <button
            type="button"
            class="tool-button tool-button--quiet"
            @click="input = 'Meowv Studio 本地工具 🚀'"
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
    <ToolOutput title="Base64 结果" :value="output" filename="base64.txt" />
  </div>
  <ToolHelp
    :steps="['输入任意 UTF-8 文本。', '点击 Base64 编码。', '复制或下载编码结果。']"
    note="内容只在当前浏览器页面中处理。"
  />
</template>
