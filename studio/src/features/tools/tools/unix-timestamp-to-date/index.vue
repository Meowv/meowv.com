<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconCalendarTime, IconClock, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { timestampToDate, type TimestampDetails, type TimestampUnit } from './utils';

const input = ref('');
const unit = ref<TimestampUnit>('auto');
const result = ref<TimestampDetails | null>(null);
const error = ref('');
const output = computed(() =>
  result.value
    ? [
        `本地时间：${result.value.local}`,
        `UTC：${result.value.utc}`,
        `ISO 8601：${result.value.iso}`,
        `秒级时间戳：${result.value.seconds}`,
        `毫秒时间戳：${result.value.milliseconds}`,
        `浏览器时区：${result.value.timezone}`,
      ].join('\n')
    : '',
);

function convert(): void {
  error.value = '';
  try {
    result.value = timestampToDate(input.value, unit.value);
  } catch (cause) {
    result.value = null;
    error.value = cause instanceof Error ? cause.message : '转换失败。';
  }
}

function useNow(): void {
  input.value = String(Date.now());
  unit.value = 'milliseconds';
  convert();
}

function clear(): void {
  input.value = '';
  result.value = null;
  error.value = '';
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="Unix Timestamp" description="自动识别常见的秒级或毫秒级时间戳。">
      <div class="tool-stack">
        <div class="tool-inline-fields">
          <label class="tool-field">
            <span>时间戳</span>
            <input v-model="input" type="text" inputmode="numeric" placeholder="例如：1717200000" />
          </label>
          <label class="tool-field">
            <span>单位</span>
            <select v-model="unit">
              <option value="auto">自动识别</option>
              <option value="seconds">秒</option>
              <option value="milliseconds">毫秒</option>
            </select>
          </label>
        </div>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="convert">
            <IconCalendarTime :size="16" aria-hidden="true" />
            转换日期
          </button>
          <button type="button" class="tool-button tool-button--secondary" @click="useNow">
            <IconClock :size="16" aria-hidden="true" />
            使用当前时间
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />
            清空
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput title="日期结果" :value="output" filename="timestamp-date.txt" />
  </div>
  <ToolHelp
    :steps="['输入 Unix 时间戳并选择单位。', '点击转换日期。', '对照本地、UTC 与 ISO 8601 结果。']"
  />
</template>
