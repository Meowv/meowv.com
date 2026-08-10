<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconBinary, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { decodeBase64, encodeBase64 } from './utils';

type Mode = 'encode' | 'decode';

const mode = ref<Mode>('encode');
const input = ref('');
const output = ref('');
const error = ref('');

const example = 'Meowv Studio 本地工具 🚀';
const title = computed(() => (mode.value === 'encode' ? 'Base64 编码' : 'Base64 解码'));
const description = computed(() =>
  mode.value === 'encode'
    ? '使用 UTF-8 处理中文、Emoji 与多语言文本。'
    : '支持标准 Base64 和文本类 Data URL。',
);

function convert(): void {
  error.value = '';
  try {
    output.value = mode.value === 'encode' ? encodeBase64(input.value) : decodeBase64(input.value);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : `${title.value}失败。`;
  }
}

function useExample(): void {
  input.value = mode.value === 'encode' ? example : 'TWVvd3YgU3R1ZGlvIOacrOWcsOW3peWFtw==';
}

function clear(): void {
  input.value = '';
  output.value = '';
  error.value = '';
}
</script>

<template>
  <div class="tool-stack">
    <label class="tool-inline-select">
      <span>操作</span>
      <select v-model="mode" aria-label="Base64 操作">
        <option value="encode">编码</option>
        <option value="decode">解码</option>
      </select>
    </label>
    <div class="tool-workspace-grid">
      <ToolSection :title="title" :description="description">
        <div class="tool-stack">
          <ToolInput
            v-model="input"
            :label="mode === 'encode' ? '原始文本' : 'Base64 内容'"
            :placeholder="mode === 'encode' ? example : 'TWVvd3YgU3R1ZGlv'"
          />
          <ToolActions>
            <button type="button" class="tool-button tool-button--primary" @click="convert">
              <IconBinary :size="16" aria-hidden="true" />
              {{ title }}
            </button>
            <button type="button" class="tool-button tool-button--quiet" @click="useExample">
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
        :title="`${title}结果`"
        :value="output"
        :filename="mode === 'encode' ? 'base64.txt' : 'decoded.txt'"
      />
    </div>
  </div>
  <ToolHelp
    :steps="[
      mode === 'encode' ? '输入任意 UTF-8 文本。' : '粘贴标准 Base64 内容。',
      `点击${title}。`,
      '复制或下载结果。',
    ]"
    note="二进制文件请使用 Base64 文件转换工具；内容只在当前浏览器页面中处理。"
  />
</template>
