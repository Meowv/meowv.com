<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconArrowsExchange, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { transformTextCodec, type TextCodecMode } from './text-codecs';

const props = defineProps<{ mode: TextCodecMode }>();
const input = ref('');
const output = ref('');
const error = ref('');

const content = computed(() => {
  const map: Record<TextCodecMode, { title: string; description: string; example: string }> = {
    'url-parser': {
      title: 'URL 解析',
      description: '拆解协议、主机、路径、查询参数与锚点。',
      example: 'https://studio.meowv.com/tools?category=encode&source=home#result',
    },
    'html-encode': {
      title: 'HTML 实体编码',
      description: '转义 &、<、>、引号与单引号。',
      example: '<p title="Studio">Meowv & Tools</p>',
    },
    'html-decode': {
      title: 'HTML 实体解码',
      description: '将 HTML 实体还原为普通字符。',
      example: '&lt;p&gt;Meowv &amp; Tools&lt;/p&gt;',
    },
    'unicode-to-chinese': {
      title: 'Unicode 转文本',
      description: '还原 \\uXXXX 与 \\u{XXXXX} 转义序列。',
      example: '\\u4F60\\u597D\\uFF0CStudio\\uFF01',
    },
    'chinese-to-unicode': {
      title: '文本转 Unicode',
      description: '将非 ASCII 字符转换为 Unicode 转义。',
      example: '你好，Studio！',
    },
    ascii: {
      title: 'ASCII / 十进制转换',
      description: '文本与 UTF-8 十进制字节双向转换。',
      example: 'Meowv Studio',
    },
    binary: {
      title: '二进制转换',
      description: '文本与 UTF-8 二进制字节双向转换。',
      example: 'Meowv',
    },
    octal: {
      title: '八进制转换',
      description: '文本与 UTF-8 八进制字节双向转换。',
      example: 'Meowv',
    },
    hex: {
      title: '十六进制转换',
      description: '文本与 UTF-8 十六进制字节双向转换。',
      example: 'Meowv',
    },
  };
  return map[props.mode];
});

function convert(): void {
  error.value = '';
  try {
    output.value = transformTextCodec(input.value, props.mode);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '转换失败。';
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
    <ToolSection :title="content.title" :description="content.description">
      <div class="tool-stack">
        <ToolInput v-model="input" label="输入内容" :placeholder="content.example" />
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="convert">
            <IconArrowsExchange :size="16" aria-hidden="true" />转换
          </button>
          <button
            type="button"
            class="tool-button tool-button--quiet"
            @click="input = content.example"
          >
            使用示例
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput :title="`${content.title}结果`" :value="output" filename="codec-result.txt" />
  </div>
  <ToolHelp
    :steps="['输入需要处理的内容。', '点击转换。', '核对后复制或下载结果。']"
    :note="
      ['ascii', 'binary', 'octal', 'hex'].includes(mode)
        ? '输入符合当前进制的空格分隔字节时会自动解码，否则会编码文本。'
        : '内容仅在浏览器本地处理。'
    "
  />
</template>
