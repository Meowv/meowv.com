<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconEraser, IconLink } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { decodeUrlComponent, encodeUrlComponent } from './utils';

type Mode = 'encode' | 'decode';

const mode = ref<Mode>('encode');
const input = ref('');
const output = ref('');
const error = ref('');

const example = '关键词=Meowv Studio 本地工具';
const encodedExample = '%E5%85%B3%E9%94%AE%E8%AF%8D%3DMeowv%20Studio';
const title = computed(() => (mode.value === 'encode' ? 'URL 编码' : 'URL 解码'));
const description = computed(() =>
  mode.value === 'encode'
    ? '按 URL 组件规则编码保留字符、中文和空格。'
    : '兼容百分号编码和表单参数中的加号空格。',
);

function convert(): void {
  error.value = '';
  try {
    output.value =
      mode.value === 'encode' ? encodeUrlComponent(input.value) : decodeUrlComponent(input.value);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : `${title.value}失败。`;
  }
}

function useExample(): void {
  input.value = mode.value === 'encode' ? example : encodedExample;
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
      <select v-model="mode" aria-label="URL 操作">
        <option value="encode">编码</option>
        <option value="decode">解码</option>
      </select>
    </label>
    <div class="tool-workspace-grid">
      <ToolSection :title="title" :description="description">
        <div class="tool-stack">
          <ToolInput
            v-model="input"
            :label="mode === 'encode' ? '待编码内容' : 'URL 编码内容'"
            :placeholder="mode === 'encode' ? example : '%E6%9C%AC%E5%9C%B0%E5%B7%A5%E5%85%B7'"
          />
          <ToolActions>
            <button type="button" class="tool-button tool-button--primary" @click="convert">
              <IconLink :size="16" aria-hidden="true" />
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
        :filename="mode === 'encode' ? 'url-encoded.txt' : 'url-decoded.txt'"
      />
    </div>
  </div>
  <ToolHelp
    :steps="[
      mode === 'encode' ? '输入 URL 参数值或文本片段。' : '粘贴 URL 编码内容。',
      `点击${title}。`,
      '复制结果用于链接或请求参数。',
    ]"
  />
</template>
