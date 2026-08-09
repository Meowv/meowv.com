<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconEraser, IconPlayerPlay } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { curlToFetch, parseHeaders, parseUserAgent, testRegex } from './developer-inspectors';

type Mode = 'regex' | 'user-agent' | 'headers' | 'curl';
const props = defineProps<{ mode: Mode }>();
const input = ref('');
const pattern = ref('(Studio)\\s+(Tools)');
const flags = ref('gi');
const output = ref('');
const error = ref('');
const content = computed(
  () =>
    ({
      regex: [
        '正则表达式测试',
        '查找匹配位置、捕获组与命名分组。',
        'Meowv Studio Tools\nStudio tools are local.',
      ],
      'user-agent': [
        'User-Agent 查看',
        '识别浏览器、系统、设备类型与爬虫特征。',
        navigator.userAgent,
      ],
      headers: [
        'HTTP Header 查看',
        '解析响应状态行、重复 Header 与字段数量。',
        'HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\nSet-Cookie: a=1\nSet-Cookie: b=2',
      ],
      curl: [
        'cURL 转换器',
        '将常见 cURL 参数转换为浏览器 Fetch 代码。',
        "curl 'https://api.example.com/tools' -X POST -H 'Content-Type: application/json' -d '{\"name\":\"Studio\"}'",
      ],
    })[props.mode],
);

function run(): void {
  error.value = '';
  try {
    if (props.mode === 'regex')
      output.value = JSON.stringify(
        { matches: testRegex(pattern.value, flags.value, input.value) },
        null,
        2,
      );
    else if (props.mode === 'user-agent')
      output.value = JSON.stringify(parseUserAgent(input.value), null, 2);
    else if (props.mode === 'headers')
      output.value = JSON.stringify(parseHeaders(input.value), null, 2);
    else output.value = curlToFetch(input.value);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '分析失败。';
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
    <ToolSection :title="content[0]" :description="content[1]">
      <div class="tool-stack">
        <div v-if="mode === 'regex'" class="tool-inline-fields">
          <label class="tool-field"><span>表达式</span><input v-model="pattern" /></label>
          <label class="tool-field"
            ><span>Flags</span><input v-model="flags" placeholder="gimuysd"
          /></label>
        </div>
        <ToolInput
          v-model="input"
          :label="mode === 'regex' ? '测试文本' : '输入内容'"
          :placeholder="content[2]"
        />
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="run">
            <IconPlayerPlay :size="16" aria-hidden="true" />{{ mode === 'curl' ? '转换' : '分析' }}
          </button>
          <button type="button" class="tool-button tool-button--quiet" @click="input = content[2]">
            使用示例
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput
      :title="`${content[0]}结果`"
      :value="output"
      :filename="mode === 'curl' ? 'request.js' : 'analysis.json'"
    />
  </div>
  <ToolHelp :steps="['填写输入内容与参数。', '执行本地分析。', '复制或下载结果。']" />
</template>
