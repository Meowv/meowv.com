<script setup lang="ts">
import { ref } from 'vue';
import { IconEraser, IconHash } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { hashText, type HashAlgorithm } from './hash';

const props = defineProps<{
  algorithm: HashAlgorithm;
}>();

const input = ref('');
const output = ref('');
const error = ref('');
const processing = ref(false);

async function calculate(): Promise<void> {
  error.value = '';
  processing.value = true;
  try {
    output.value = await hashText(input.value, props.algorithm);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '摘要计算失败。';
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
    <ToolSection
      :title="`${algorithm} 输入`"
      description="文本按 UTF-8 编码后在浏览器本地计算摘要。"
    >
      <div class="tool-stack">
        <ToolInput v-model="input" label="原始文本" placeholder="输入需要计算摘要的内容" />
        <ToolActions>
          <button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="processing"
            @click="calculate"
          >
            <IconHash :size="16" aria-hidden="true" />
            {{ processing ? '计算中…' : `计算 ${algorithm}` }}
          </button>
          <button
            type="button"
            class="tool-button tool-button--quiet"
            @click="input = 'Meowv Studio'"
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
    <ToolOutput
      :title="`${algorithm} 摘要`"
      :value="output"
      :filename="`${algorithm.toLowerCase()}-hash.txt`"
    />
  </div>
  <ToolHelp
    :steps="['输入文本内容。', `点击计算 ${algorithm}。`, '复制或下载十六进制摘要。']"
    :note="
      algorithm === 'MD5'
        ? 'MD5 不适合密码存储或安全签名，仅用于兼容和完整性比对。'
        : '摘要不可逆，不能用于还原原文。'
    "
  />
</template>
