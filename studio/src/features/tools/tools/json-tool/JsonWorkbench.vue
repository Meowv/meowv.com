<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { IconBraces, IconCheck, IconEraser, IconFileZip, IconRefresh } from '@tabler/icons-vue';
import CopyButton from '@/features/tools/components/CopyButton.vue';
import DownloadButton from '@/features/tools/components/DownloadButton.vue';
import ToolCodeEditor from '@/features/tools/components/ToolCodeEditor.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolPane from '@/features/tools/components/ToolPane.vue';
import ToolWorkspace from '@/features/tools/components/ToolWorkspace.vue';
import { formatJson, minifyJson, parseJson } from './utils';

type JsonMode = 'format' | 'minify' | 'validate';
type IndentOption = '2' | '4' | 'tab';

const props = withDefaults(defineProps<{ mode?: JsonMode }>(), { mode: 'format' });

const example = `{
  "name": "Meowv Studio",
  "version": "1.0.0",
  "active": true,
  "features": ["JSON format", "converter", "validator"],
  "config": { "theme": "light", "language": "zh-CN" }
}`;

const input = ref(example);
const output = ref('');
const message = ref('');
const error = ref('');
const indent = ref<IndentOption>('2');
const wordWrap = ref(true);

const primaryAction = computed(() => {
  if (props.mode === 'minify')
    return { label: '压缩', action: 'minify' as const, icon: IconFileZip };
  if (props.mode === 'validate')
    return { label: '校验', action: 'validate' as const, icon: IconCheck };
  return { label: '格式化', action: 'format' as const, icon: IconBraces };
});
const outputTitle = computed(() => (props.mode === 'validate' ? '校验结果' : '输出结果'));
const indentValue = computed(() => (indent.value === 'tab' ? '\t' : Number(indent.value)));

function run(action: JsonMode): void {
  error.value = '';
  message.value = '';
  try {
    if (action === 'format') {
      output.value = formatJson(input.value, indentValue.value);
      message.value = `格式正确 · 已按${indent.value === 'tab' ? ' Tab' : ` ${indent.value} 空格`}缩进`;
    } else if (action === 'minify') {
      output.value = minifyJson(input.value);
      message.value = '格式正确 · 已移除多余空白';
    } else {
      const parsed = parseJson(input.value);
      output.value = JSON.stringify(parsed.value, null, indentValue.value);
      message.value = 'JSON 格式有效';
    }
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '处理失败，请检查输入内容。';
  }
}

function clear(): void {
  input.value = '';
  output.value = '';
  message.value = '';
  error.value = '';
}

function restoreExample(): void {
  input.value = example;
  run(props.mode);
}

onMounted(() => run(props.mode));
</script>

<template>
  <ToolWorkspace label="JSON 处理工作区">
    <ToolPane title="输入 JSON">
      <template #actions>
        <label class="tool-inline-select">
          <span>缩进</span>
          <select v-model="indent" aria-label="JSON 缩进方式" @change="run(mode)">
            <option value="2">2 空格</option>
            <option value="4">4 空格</option>
            <option value="tab">Tab</option>
          </select>
        </label>
        <button
          type="button"
          class="tool-button tool-button--primary"
          @click="run(primaryAction.action)"
        >
          <component :is="primaryAction.icon" :size="16" aria-hidden="true" />
          {{ primaryAction.label }}
        </button>
        <button
          v-if="mode !== 'minify'"
          type="button"
          class="tool-button tool-button--secondary"
          @click="run('minify')"
        >
          <IconFileZip :size="16" aria-hidden="true" />
          压缩
        </button>
        <button
          v-if="mode !== 'validate'"
          type="button"
          class="tool-button tool-button--secondary"
          @click="run('validate')"
        >
          <IconCheck :size="16" aria-hidden="true" />
          校验
        </button>
        <button type="button" class="tool-button tool-button--danger" @click="clear">
          <IconEraser :size="16" aria-hidden="true" />
          清空
        </button>
      </template>
      <ToolCodeEditor
        v-model="input"
        language="json"
        label="JSON 输入编辑器"
        :word-wrap="wordWrap"
      />
      <template #footer>
        <button type="button" class="tool-text-action" @click="restoreExample">
          <IconRefresh :size="15" aria-hidden="true" />
          恢复示例
        </button>
        <label class="tool-switch">
          <input v-model="wordWrap" type="checkbox" />
          自动换行
        </label>
      </template>
    </ToolPane>

    <ToolPane
      :title="outputTitle"
      tone="output"
      :status="error || message"
      :status-tone="error ? 'error' : message ? 'success' : 'neutral'"
    >
      <template #actions>
        <CopyButton :text="output" label="复制结果" />
        <DownloadButton
          :content="output"
          filename="meowv-studio.json"
          mime-type="application/json;charset=utf-8"
        />
      </template>
      <ToolCodeEditor
        v-model="output"
        language="json"
        label="JSON 输出编辑器"
        :word-wrap="wordWrap"
        read-only
      />
      <p v-if="error" class="tool-pane__message tool-pane__message--error" role="alert">
        {{ error }}
      </p>
      <p v-else-if="message" class="tool-pane__message" role="status">{{ message }}</p>
    </ToolPane>
  </ToolWorkspace>

  <ToolHelp
    :steps="[
      '输入或粘贴 JSON，编辑器会保留行号与结构高亮。',
      '根据当前工具执行格式化、压缩或校验。',
      '确认状态后复制结果或下载 JSON 文件。',
    ]"
    note="解析与格式化由浏览器原生 JSON API 在本地完成。"
  />
</template>
