<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconCalculator, IconClock, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { toDateTimeLocalValue } from '@/features/tools/tools/date-to-unix-timestamp/utils';
import {
  addDate,
  addWorkdays,
  calculateAge,
  dateDifference,
  formatDate,
  formatInZone,
  parseDate,
  zonedTimeToUtc,
  type DateUnit,
} from './date-utils';

type DateMode =
  | 'seconds'
  | 'milliseconds'
  | 'add-subtract'
  | 'difference'
  | 'age'
  | 'workday'
  | 'formatter'
  | 'iso8601'
  | 'timezone';

const props = defineProps<{ mode: DateMode }>();
const now = new Date();
const primary = ref(toDateTimeLocalValue(now));
const secondary = ref(toDateTimeLocalValue(new Date(now.getTime() + 86_400_000)));
const birthDate = ref('2000-01-01');
const targetDate = ref(now.toISOString().slice(0, 10));
const amount = ref(1);
const operation = ref<'add' | 'subtract'>('add');
const unit = ref<DateUnit>('days');
const pattern = ref('YYYY-MM-DD HH:mm:ss');
const sourceZone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai');
const targetZone = ref('UTC');
const output = ref('');
const error = ref('');

const timeZones = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];
if (!timeZones.includes(sourceZone.value)) timeZones.unshift(sourceZone.value);

const content = computed(() => {
  const map: Record<DateMode, { title: string; description: string }> = {
    seconds: { title: '秒级时间戳', description: '生成当前 Unix 秒级时间戳。' },
    milliseconds: { title: '毫秒时间戳', description: '生成当前 Unix 毫秒时间戳。' },
    'add-subtract': { title: '日期加减', description: '按分钟、小时、天、周、月或年调整日期。' },
    difference: { title: '日期差计算', description: '计算两个时间点之间的精确时长。' },
    age: { title: '年龄计算', description: '计算指定日期时的周岁、月份与天数。' },
    workday: { title: '工作日计算', description: '按周一至周五计算目标日期。' },
    formatter: { title: '日期格式化', description: '使用常用日期令牌输出自定义格式。' },
    iso8601: { title: 'ISO 8601 转换', description: '输出 ISO、UTC、本地时间与时间戳。' },
    timezone: { title: '时区转换', description: '将指定时区的墙上时间转换到另一时区。' },
  };
  return map[props.mode];
});

function calculate(): void {
  error.value = '';
  try {
    if (props.mode === 'seconds') output.value = String(Math.floor(Date.now() / 1000));
    else if (props.mode === 'milliseconds') output.value = String(Date.now());
    else if (props.mode === 'add-subtract') {
      const value = operation.value === 'add' ? amount.value : -amount.value;
      const result = addDate(primary.value, value, unit.value);
      output.value = [
        `本地时间：${result.toLocaleString()}`,
        `ISO 8601：${result.toISOString()}`,
        `秒级时间戳：${Math.floor(result.getTime() / 1000)}`,
      ].join('\n');
    } else if (props.mode === 'difference')
      output.value = dateDifference(primary.value, secondary.value);
    else if (props.mode === 'age') output.value = calculateAge(birthDate.value, targetDate.value);
    else if (props.mode === 'workday') {
      const result = addWorkdays(targetDate.value, amount.value);
      output.value = [
        `目标日期：${result.toLocaleDateString()}`,
        `星期：${new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(result)}`,
        `ISO 日期：${formatDate(result, 'YYYY-MM-DD')}`,
      ].join('\n');
    } else if (props.mode === 'formatter')
      output.value = formatDate(parseDate(primary.value), pattern.value);
    else if (props.mode === 'iso8601') {
      const result = parseDate(primary.value);
      output.value = [
        `ISO 8601：${result.toISOString()}`,
        `UTC：${result.toUTCString()}`,
        `本地时间：${result.toLocaleString()}`,
        `秒级时间戳：${Math.floor(result.getTime() / 1000)}`,
        `毫秒时间戳：${result.getTime()}`,
      ].join('\n');
    } else {
      const result = zonedTimeToUtc(primary.value, sourceZone.value);
      output.value = [
        `源时区：${sourceZone.value} · ${formatInZone(result, sourceZone.value)}`,
        `目标时区：${targetZone.value} · ${formatInZone(result, targetZone.value)}`,
        `ISO 8601：${result.toISOString()}`,
      ].join('\n');
    }
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '日期计算失败。';
  }
}

function clear(): void {
  output.value = '';
  error.value = '';
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="content.title" :description="content.description">
      <div class="tool-stack">
        <template v-if="!['seconds', 'milliseconds', 'age', 'workday'].includes(mode)">
          <label class="tool-field"
            ><span>日期时间</span><input v-model="primary" type="datetime-local"
          /></label>
        </template>
        <label v-if="mode === 'difference'" class="tool-field"
          ><span>结束时间</span><input v-model="secondary" type="datetime-local"
        /></label>
        <div v-if="mode === 'age'" class="tool-inline-fields">
          <label class="tool-field"
            ><span>出生日期</span><input v-model="birthDate" type="date"
          /></label>
          <label class="tool-field"
            ><span>计算日期</span><input v-model="targetDate" type="date"
          /></label>
        </div>
        <label v-if="mode === 'workday'" class="tool-field"
          ><span>开始日期</span><input v-model="targetDate" type="date"
        /></label>
        <div v-if="mode === 'add-subtract'" class="tool-inline-fields">
          <label class="tool-field"
            ><span>操作</span
            ><select v-model="operation">
              <option value="add">增加</option>
              <option value="subtract">减去</option>
            </select></label
          >
          <label class="tool-field"
            ><span>数量</span><input v-model.number="amount" type="number"
          /></label>
          <label class="tool-field"
            ><span>单位</span
            ><select v-model="unit">
              <option value="minutes">分钟</option>
              <option value="hours">小时</option>
              <option value="days">天</option>
              <option value="weeks">周</option>
              <option value="months">月</option>
              <option value="years">年</option>
            </select></label
          >
        </div>
        <label v-if="mode === 'workday'" class="tool-field"
          ><span>工作日数量</span><input v-model.number="amount" type="number"
        /></label>
        <label v-if="mode === 'formatter'" class="tool-field"
          ><span>格式</span><input v-model="pattern" /><small
            >支持 YYYY、MM、DD、HH、mm、ss、SSS</small
          ></label
        >
        <div v-if="mode === 'timezone'" class="tool-inline-fields">
          <label class="tool-field"
            ><span>源时区</span
            ><select v-model="sourceZone">
              <option v-for="zone in timeZones" :key="zone" :value="zone">{{ zone }}</option>
            </select></label
          >
          <label class="tool-field"
            ><span>目标时区</span
            ><select v-model="targetZone">
              <option v-for="zone in timeZones" :key="zone" :value="zone">{{ zone }}</option>
            </select></label
          >
        </div>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="calculate">
            <IconClock
              v-if="['seconds', 'milliseconds'].includes(mode)"
              :size="16"
              aria-hidden="true"
            />
            <IconCalculator v-else :size="16" aria-hidden="true" />
            {{ ['seconds', 'milliseconds'].includes(mode) ? '获取当前时间戳' : '开始计算' }}
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空结果
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput :title="`${content.title}结果`" :value="output" filename="date-result.txt" />
  </div>
  <ToolHelp
    :steps="['填写日期与计算参数。', '点击执行按钮。', '复制或下载结果。']"
    note="日期计算均在浏览器本地完成；工作日默认仅排除周六和周日，不包含法定节假日。"
  />
</template>
