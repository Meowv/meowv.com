<script setup lang="ts">
import { ref } from 'vue';
import { IconBinary, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { decodeBase64 } from './utils';

const input = ref('');
const output = ref('');
const error = ref('');

function decode(): void {
  error.value = '';
  try {
    output.value = decodeBase64(input.value);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '解码失败。';
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
    <ToolSection title="输入 Base64" description="支持标准 Base64 和文本类 Data URL。">
      <div class="tool-stack">
        <ToolInput v-model="input" label="Base64 内容" placeholder="例如：TWVvd3YgU3R1ZGlv" />
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="decode">
            <IconBinary :size="16" aria-hidden="true" />
            Base64 解码
          </button>
          <button
            type="button"
            class="tool-button tool-button--quiet"
            @click="input = 'TWVvd3YgU3R1ZGlvIOacrOWcsOW3peWFtw=='"
          >
            使用示例
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />
            清空
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput title="解码文本" :value="output" filename="decoded.txt" />
  </div>
  <ToolHelp
    :steps="['粘贴标准 Base64 内容。', '点击 Base64 解码。', '确认 UTF-8 文本后复制或下载。']"
    note="二进制文件请使用 Base64 文件转换工具；这里专注于文本解码。"
  />
</template>
