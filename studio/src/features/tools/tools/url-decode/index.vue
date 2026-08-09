<script setup lang="ts">
import { ref } from 'vue';
import { IconLink, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { decodeUrlComponent } from './utils';

const input = ref('');
const output = ref('');
const error = ref('');

function decode(): void {
  error.value = '';
  try {
    output.value = decodeUrlComponent(input.value);
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
    <ToolSection title="输入编码内容" description="兼容百分号编码和表单参数中的加号空格。">
      <div class="tool-stack">
        <ToolInput
          v-model="input"
          label="URL 编码内容"
          placeholder="例如：%E6%9C%AC%E5%9C%B0%E5%B7%A5%E5%85%B7"
        />
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="decode">
            <IconLink :size="16" aria-hidden="true" />
            URL 解码
          </button>
          <button
            type="button"
            class="tool-button tool-button--quiet"
            @click="input = '%E5%85%B3%E9%94%AE%E8%AF%8D%3DMeowv%20Studio'"
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
    <ToolOutput title="解码结果" :value="output" filename="url-decoded.txt" />
  </div>
  <ToolHelp :steps="['粘贴 URL 编码内容。', '点击 URL 解码。', '复制还原后的文本。']" />
</template>
