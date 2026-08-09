<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconEraser, IconPlayerPlay } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import {
  diffJson,
  generateSchema,
  mockFromSample,
  parseJsonInput,
  queryJsonPath,
  validateSchema,
} from './json-advanced';

type Mode = 'diff' | 'schema-generator' | 'schema-validator' | 'mock' | 'path';
const props = defineProps<{ mode: Mode }>();
const sample =
  '{\n  "name": "Meowv Studio",\n  "local": true,\n  "tools": [{ "id": "json", "ready": true }]\n}';
const input = ref('');
const secondInput = ref('');
const path = ref('$.tools[*].id');
const output = ref('');
const error = ref('');
const content = computed(
  () =>
    ({
      diff: ['JSON 差异对比', '递归比较字段、数组与值。'],
      'schema-generator': ['JSON Schema 生成器', '根据示例数据推断 Draft 2020-12 Schema。'],
      'schema-validator': ['JSON Schema 校验', '按常用 Schema 规则校验 JSON。'],
      mock: ['JSON Mock 数据生成', '根据示例结构生成本地测试数据。'],
      path: ['JSONPath 查询', '支持属性、索引、通配符与递归属性查询。'],
    })[props.mode],
);

function run(): void {
  error.value = '';
  try {
    const value = parseJsonInput(input.value);
    if (props.mode === 'diff') {
      const changes = diffJson(value, parseJsonInput(secondInput.value, '对比 JSON'));
      output.value = changes.length ? changes.join('\n') : '两份 JSON 内容一致。';
    } else if (props.mode === 'schema-generator')
      output.value = JSON.stringify(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', ...generateSchema(value) },
        null,
        2,
      );
    else if (props.mode === 'schema-validator') {
      const errors = validateSchema(value, parseJsonInput(secondInput.value, 'JSON Schema'));
      output.value = errors.length
        ? `校验失败，共 ${errors.length} 项：\n${errors.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
        : '校验通过：JSON 符合当前 Schema。';
    } else if (props.mode === 'mock') output.value = JSON.stringify(mockFromSample(value), null, 2);
    else output.value = JSON.stringify(queryJsonPath(value, path.value), null, 2);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : 'JSON 处理失败。';
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
    <ToolSection :title="content[0]" :description="content[1]">
      <div class="tool-stack">
        <ToolInput v-model="input" label="JSON 内容" :placeholder="sample" />
        <ToolInput
          v-if="mode === 'diff'"
          v-model="secondInput"
          label="对比 JSON"
          placeholder="输入第二份 JSON"
        />
        <ToolInput
          v-if="mode === 'schema-validator'"
          v-model="secondInput"
          label="JSON Schema"
          placeholder="输入 JSON Schema"
        />
        <label v-if="mode === 'path'" class="tool-field"
          ><span>JSONPath</span><input v-model="path" placeholder="$.tools[*].id"
        /></label>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="run">
            <IconPlayerPlay :size="16" aria-hidden="true" />执行
          </button>
          <button type="button" class="tool-button tool-button--quiet" @click="input = sample">
            使用示例
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput :title="`${content[0]}结果`" :value="output" filename="json-result.json" />
  </div>
  <ToolHelp
    :steps="['输入有效 JSON 与所需参数。', '点击执行。', '核对并复制结果。']"
    note="Schema 校验覆盖常用 type、required、properties、items、enum、长度、范围和 pattern 规则。"
  />
</template>
