<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconClockSearch, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { dialectLabel, nextCronRuns, parseCron, type CronDialect, type ParsedCron } from './utils';

const input = ref('*/15 9-18 * * 1-5');
const dialect = ref<CronDialect>('linux');
const parsed = ref<ParsedCron | null>(null);
const runs = ref<Date[]>([]);
const error = ref('');
const output = computed(() =>
  parsed.value
    ? [
        `类型：${dialectLabel(parsed.value.dialect)}`,
        `表达式：${parsed.value.expression}`,
        '',
        ...parsed.value.fields.map((field) => `${field.label}：${field.value}`),
        '',
        '未来执行时间：',
        ...runs.value.map(
          (date, index) => `${index + 1}. ${date.toLocaleString()} · ${date.toISOString()}`,
        ),
      ].join('\n')
    : '',
);

function exampleFor(value: CronDialect): string {
  return value === 'quartz' ? '0 */15 9-18 ? * MON-FRI' : '*/15 9-18 * * 1-5';
}

function updateDialect(): void {
  input.value = exampleFor(dialect.value);
  parsed.value = null;
  runs.value = [];
  error.value = '';
}

function inspect(): void {
  error.value = '';
  try {
    const schedule = parseCron(input.value, dialect.value);
    parsed.value = schedule;
    runs.value = nextCronRuns(schedule, 5);
  } catch (cause) {
    parsed.value = null;
    runs.value = [];
    error.value = cause instanceof Error ? cause.message : 'Cron 解析失败。';
  }
}

function clear(): void {
  input.value = '';
  parsed.value = null;
  runs.value = [];
  error.value = '';
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection
      title="Cron 表达式"
      description="解析 Linux、Quartz 与 Hangfire 常用语法并计算未来执行时间。"
    >
      <div class="tool-stack">
        <div class="tool-inline-fields">
          <label class="tool-field">
            <span>表达式类型</span>
            <select v-model="dialect" @change="updateDialect">
              <option value="linux">Linux Cron</option>
              <option value="quartz">Quartz Cron</option>
              <option value="hangfire">Hangfire Cron</option>
            </select>
          </label>
          <label class="tool-field">
            <span>Cron 表达式</span>
            <input v-model="input" type="text" spellcheck="false" placeholder="*/15 9-18 * * 1-5" />
          </label>
        </div>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="inspect">
            <IconClockSearch :size="16" aria-hidden="true" />
            解析并计算
          </button>
          <button
            type="button"
            class="tool-button tool-button--quiet"
            @click="input = exampleFor(dialect)"
          >
            使用示例
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />
            清空
          </button>
        </ToolActions>
        <p class="tool-status">
          未来时间按当前浏览器时区计算；Linux 与 Hangfire 使用 5 字段，Quartz 使用 6 或 7 字段。
        </p>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput title="解析结果" :value="output" filename="cron-analysis.txt" />
  </div>
</template>
