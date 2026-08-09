<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconCalendarTime, IconClock } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import {
  dateToTimestamp,
  toDateTimeLocalValue,
  type DateInterpretation,
  type DateTimestampDetails,
} from './utils';

const input = ref(toDateTimeLocalValue());
const interpretation = ref<DateInterpretation>('local');
const result = ref<DateTimestampDetails | null>(null);
const error = ref('');
const output = computed(() =>
  result.value
    ? [
        `秒级时间戳：${result.value.seconds}`,
        `毫秒时间戳：${result.value.milliseconds}`,
        `ISO 8601：${result.value.date.toISOString()}`,
        `本地时间：${result.value.date.toLocaleString()}`,
      ].join('\n')
    : '',
);

function convert(): void {
  error.value = '';
  try {
    result.value = dateToTimestamp(input.value, interpretation.value);
  } catch (cause) {
    result.value = null;
    error.value = cause instanceof Error ? cause.message : '转换失败。';
  }
}

function useNow(): void {
  input.value = toDateTimeLocalValue();
  interpretation.value = 'local';
  convert();
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="日期与时间" description="明确指定输入值按浏览器本地时间或 UTC 解释。">
      <div class="tool-stack">
        <div class="tool-inline-fields">
          <label class="tool-field">
            <span>日期时间</span>
            <input v-model="input" type="datetime-local" />
          </label>
          <label class="tool-field">
            <span>解释方式</span>
            <select v-model="interpretation">
              <option value="local">浏览器本地时间</option>
              <option value="utc">UTC 时间</option>
            </select>
          </label>
        </div>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="convert">
            <IconCalendarTime :size="16" aria-hidden="true" />
            转换时间戳
          </button>
          <button type="button" class="tool-button tool-button--secondary" @click="useNow">
            <IconClock :size="16" aria-hidden="true" />
            使用当前时间
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput title="Unix Timestamp" :value="output" filename="date-timestamp.txt" />
  </div>
  <ToolHelp
    :steps="['选择日期时间。', '确认按本地时间还是 UTC 解释。', '转换并复制秒级或毫秒级时间戳。']"
  />
</template>
