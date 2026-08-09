<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconEraser, IconSparkles } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { processText, type TextProcessMode } from './text-tools';

const props = defineProps<{ mode: TextProcessMode }>();
const input = ref('');
const secondInput = ref('');
const option = ref('upper');
const amount = ref(3);
const output = ref('');
const error = ref('');

const content = computed(() => {
  const map: Record<TextProcessMode, { title: string; description: string; example: string }> = {
    'word-count': {
      title: '字数统计',
      description: '统计词语、字符与段落数量。',
      example: 'Meowv Studio 是一个浏览器本地工具工作台。',
    },
    'character-count': {
      title: '字符统计',
      description: '统计字符、非空白字符和 UTF-8 字节。',
      example: 'Meowv Studio 🚀',
    },
    'line-count': {
      title: '行数统计',
      description: '统计总行数、非空行与段落。',
      example: '第一行\n\n第三行',
    },
    'reading-time': {
      title: '阅读时间',
      description: '按每分钟 300 个词语估算阅读时长。',
      example: '粘贴需要估算阅读时间的文章内容。',
    },
    'text-diff': {
      title: '文本差异对比',
      description: '按行标记新增、删除和未变化内容。',
      example: '第一行\n旧内容\n第三行',
    },
    'markdown-diff': {
      title: 'Markdown 差异对比',
      description: '按行比较两份 Markdown。',
      example: '# 标题\n\n- 旧项目',
    },
    'trim-spaces': {
      title: '去除多余空格',
      description: '清理行首尾空白并合并连续空格。',
      example: '  Meowv    Studio  \n  本地工具  ',
    },
    'remove-empty-lines': {
      title: '去除空行',
      description: '移除只包含空白字符的行。',
      example: '第一行\n\n第二行\n  \n第三行',
    },
    'remove-duplicate-lines': {
      title: '去除重复行',
      description: '保留每行第一次出现的位置。',
      example: 'apple\nbanana\napple\norange',
    },
    'sort-lines': {
      title: '行排序',
      description: '按浏览器本地排序规则整理文本行。',
      example: 'banana\norange\napple',
    },
    'case-converter': {
      title: '大小写转换',
      description: '转换为大写、小写或标题格式。',
      example: 'meowv studio local tools',
    },
    'camel-case-converter': {
      title: '驼峰转换',
      description: '将空格、短横线或下划线文本转为 camelCase。',
      example: 'meowv-studio local_tools',
    },
    'snake-case-converter': {
      title: '下划线转换',
      description: '将多种命名形式转为 snake_case。',
      example: 'MeowvStudio local-tools',
    },
    'markdown-table-generator': {
      title: 'Markdown 表格生成器',
      description: '将逗号或制表符分隔数据转换为 Markdown 表格。',
      example: '名称,分类,状态\nJSON 格式化,开发,完成\n图片压缩,图片,完成',
    },
    'lorem-ipsum': { title: 'Lorem Ipsum', description: '生成英文排版占位文本。', example: '' },
    'dummy-text': {
      title: '示例文本生成',
      description: '生成中文界面与排版测试文本。',
      example: '',
    },
  };
  return map[props.mode];
});

const isGenerator = computed(() => ['lorem-ipsum', 'dummy-text'].includes(props.mode));
const isDiff = computed(() => ['text-diff', 'markdown-diff'].includes(props.mode));

function run(): void {
  error.value = '';
  try {
    output.value = processText(
      props.mode,
      input.value,
      secondInput.value,
      option.value,
      amount.value,
    );
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '文本处理失败。';
  }
}

function clear(): void {
  input.value = '';
  secondInput.value = '';
  output.value = '';
  error.value = '';
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="content.title" :description="content.description">
      <div class="tool-stack">
        <ToolInput
          v-if="!isGenerator"
          v-model="input"
          :label="isDiff ? '原始内容' : '输入文本'"
          :placeholder="content.example"
        />
        <ToolInput
          v-if="isDiff"
          v-model="secondInput"
          label="修改后内容"
          placeholder="输入需要对比的新内容"
        />
        <label v-if="mode === 'sort-lines'" class="tool-field"
          ><span>排序方向</span
          ><select v-model="option">
            <option value="asc">升序</option>
            <option value="desc">降序</option>
          </select></label
        >
        <label v-if="mode === 'case-converter'" class="tool-field"
          ><span>转换方式</span
          ><select v-model="option">
            <option value="upper">大写</option>
            <option value="lower">小写</option>
            <option value="title">标题格式</option>
          </select></label
        >
        <label v-if="isGenerator" class="tool-field"
          ><span>段落数量</span><input v-model.number="amount" type="number" min="1" max="20"
        /></label>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="run">
            <IconSparkles :size="16" aria-hidden="true" />{{
              isGenerator ? '生成文本' : isDiff ? '开始对比' : '处理文本'
            }}
          </button>
          <button
            v-if="!isGenerator"
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
    <ToolOutput :title="`${content.title}结果`" :value="output" filename="text-result.txt" />
  </div>
  <ToolHelp :steps="['输入或生成待处理文本。', '选择参数并执行。', '复制或下载结果。']" />
</template>
