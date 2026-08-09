<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconClockPlus } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import {
  dialectLabel,
  nextCronRuns,
  parseCron,
  type CronDialect,
} from '@/features/tools/tools/cron-parser/utils';
import { generateCron, type CronFrequency } from './utils';

const dialect = ref<CronDialect>('linux');
const frequency = ref<CronFrequency>('daily');
const interval = ref(15);
const minute = ref(0);
const hour = ref(9);
const dayOfWeek = ref(1);
const dayOfMonth = ref(1);
const expression = ref('');
const runs = ref<Date[]>([]);
const error = ref('');
const output = computed(() =>
  expression.value
    ? [
        `类型：${dialectLabel(dialect.value)}`,
        `表达式：${expression.value}`,
        '',
        '未来执行时间：',
        ...runs.value.map(
          (date, index) => `${index + 1}. ${date.toLocaleString()} · ${date.toISOString()}`,
        ),
      ].join('\n')
    : '',
);

function generate(): void {
  error.value = '';
  try {
    expression.value = generateCron({
      dialect: dialect.value,
      frequency: frequency.value,
      interval: interval.value,
      minute: minute.value,
      hour: hour.value,
      dayOfWeek: dayOfWeek.value,
      dayOfMonth: dayOfMonth.value,
    });
    runs.value = nextCronRuns(parseCron(expression.value, dialect.value), 5);
  } catch (cause) {
    expression.value = '';
    runs.value = [];
    error.value = cause instanceof Error ? cause.message : 'Cron 生成失败。';
  }
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection
      title="计划参数"
      description="通过常用计划快速生成 Linux、Quartz 或 Hangfire Cron。"
    >
      <div class="tool-stack">
        <div class="tool-inline-fields">
          <label class="tool-field">
            <span>表达式类型</span>
            <select v-model="dialect">
              <option value="linux">Linux Cron</option>
              <option value="quartz">Quartz Cron</option>
              <option value="hangfire">Hangfire Cron</option>
            </select>
          </label>
          <label class="tool-field">
            <span>执行频率</span>
            <select v-model="frequency">
              <option value="minutes">每隔若干分钟</option>
              <option value="hourly">每小时</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </label>
        </div>

        <div class="tool-inline-fields">
          <label v-if="frequency === 'minutes'" class="tool-field">
            <span>分钟间隔</span>
            <input v-model.number="interval" type="number" min="1" max="59" />
          </label>
          <label v-if="frequency !== 'minutes'" class="tool-field">
            <span>分钟</span>
            <input v-model.number="minute" type="number" min="0" max="59" />
          </label>
          <label v-if="['daily', 'weekly', 'monthly'].includes(frequency)" class="tool-field">
            <span>小时</span>
            <input v-model.number="hour" type="number" min="0" max="23" />
          </label>
          <label v-if="frequency === 'weekly'" class="tool-field">
            <span>星期</span>
            <select v-model.number="dayOfWeek">
              <option :value="0">星期日</option>
              <option :value="1">星期一</option>
              <option :value="2">星期二</option>
              <option :value="3">星期三</option>
              <option :value="4">星期四</option>
              <option :value="5">星期五</option>
              <option :value="6">星期六</option>
            </select>
          </label>
          <label v-if="frequency === 'monthly'" class="tool-field">
            <span>每月日期</span>
            <input v-model.number="dayOfMonth" type="number" min="1" max="31" />
          </label>
        </div>

        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="generate">
            <IconClockPlus :size="16" aria-hidden="true" />
            生成并预览
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput title="Cron 表达式" :value="output" filename="cron-expression.txt" />
  </div>
  <ToolHelp
    :steps="['选择 Cron 类型和执行频率。', '填写时间参数。', '生成表达式并核对未来 5 次执行时间。']"
  />
</template>
