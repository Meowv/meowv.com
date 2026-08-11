<script setup lang="ts">
import { IconCheck, IconCopy, IconX } from '@tabler/icons-vue';
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

type FieldKey = 'minute' | 'hour' | 'dom' | 'month' | 'dow';

interface FieldConfig {
  key: FieldKey;
  label: string;
  min: number;
  max: number;
  names?: Record<string, number>;
  normalize?: (value: number) => number;
}

interface ParsedField {
  raw: string;
  values: Set<number>;
  wildcard: boolean;
}

interface ParsedCron {
  expression: string;
  minute: ParsedField;
  hour: ParsedField;
  dom: ParsedField;
  month: ParsedField;
  dow: ParsedField;
}

const DEFAULT_MESSAGE = '输入标准 5 字段 Cron 表达式，结果按浏览器本地时区预览';
const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const MONTH_NAMES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};
const DOW_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};
const CONFIGS: FieldConfig[] = [
  { key: 'minute', label: '分钟', min: 0, max: 59 },
  { key: 'hour', label: '小时', min: 0, max: 23 },
  { key: 'dom', label: '日', min: 1, max: 31 },
  { key: 'month', label: '月', min: 1, max: 12, names: MONTH_NAMES },
  {
    key: 'dow',
    label: '星期',
    min: 0,
    max: 7,
    names: DOW_NAMES,
    normalize: (value) => (value === 7 ? 0 : value),
  },
];
const EXAMPLES = [
  { label: '每分钟', value: '* * * * *' },
  { label: '每 5 分钟', value: '*/5 * * * *' },
  { label: '工作日 9:00', value: '0 9 * * 1-5' },
  { label: '每月 1 日', value: '0 0 1 * *' },
  { label: '每月 1/15 日', value: '30 8 1,15 * *' },
  { label: '2 月 29 日', value: '0 0 29 2 *' },
];

const cronInput = ref('0 9 * * 1-5');
const inputElement = ref<HTMLInputElement>();
const previewCount = ref(10);
const message = ref(DEFAULT_MESSAGE);
const messageIsError = ref(false);
const descriptions = reactive<Record<FieldKey, string>>({
  minute: '—',
  hour: '—',
  dom: '—',
  month: '—',
  dow: '—',
});
const dayRule = ref('—');
const occurrences = ref<Date[]>([]);
const searchNote = ref('');
const copied = ref(false);
let renderTimer: number | undefined;
let copiedTimer: number | undefined;

function normalizeExpression(value: string) {
  return value
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 65248),
    )
    .replace(/[，、]/g, ',')
    .replace(/[－—]/g, '-')
    .replace(/／/g, '/')
    .replace(/＊/g, '*')
    .replace(/\u3000/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function parseValue(token: string, config: FieldConfig) {
  if (/^\d+$/.test(token)) {
    const numeric = Number(token);
    if (numeric >= config.min && numeric <= config.max) return numeric;
  } else if (config.names && Object.prototype.hasOwnProperty.call(config.names, token)) {
    return config.names[token] ?? null;
  }
  return null;
}

function parseField(source: string, config: FieldConfig): ParsedField | { error: string } {
  const values = new Set<number>();
  const pieces = source.split(',');
  if (!source || pieces.some((piece) => !piece)) {
    return { error: `${config.label}字段包含空列表项` };
  }

  for (const piece of pieces) {
    const stepParts = piece.split('/');
    if (stepParts.length > 2 || !stepParts[0] || (stepParts.length === 2 && !stepParts[1])) {
      return { error: `${config.label}字段的步长格式无效：${piece}` };
    }

    let step = 1;
    if (stepParts.length === 2) {
      if (!/^\d+$/.test(stepParts[1]!)) {
        return { error: `${config.label}字段的步长必须为正整数` };
      }
      step = Number(stepParts[1]);
      if (step < 1 || step > config.max) {
        return { error: `${config.label}字段的步长需在 1–${config.max} 之间` };
      }
    }

    const base = stepParts[0];
    let start: number | null;
    let end: number | null;
    if (base === '*') {
      start = config.min;
      end = config.max;
    } else if (base.includes('-')) {
      const range = base.split('-');
      if (range.length !== 2) return { error: `${config.label}字段的范围格式无效：${base}` };
      start = parseValue(range[0]!, config);
      end = parseValue(range[1]!, config);
      if (start === null || end === null) {
        return { error: `${config.label}字段超出范围：${base}` };
      }
      if (start > end) return { error: `${config.label}字段的范围起点不能大于终点` };
    } else {
      start = parseValue(base, config);
      if (start === null) return { error: `${config.label}字段包含无效值：${base}` };
      end = stepParts.length === 2 ? config.max : start;
    }

    for (let value = start; value <= end; value += step) {
      values.add(config.normalize ? config.normalize(value) : value);
    }
  }

  if (!values.size) return { error: `${config.label}字段没有可用值` };
  return { raw: source, values, wildcard: source === '*' };
}

function parseCron(value: string): ParsedCron | { empty: true } | { error: string } {
  const source = normalizeExpression(value);
  if (!source) return { empty: true };
  const fields = source.split(' ');
  if (fields.length !== 5) return { error: `标准 Cron 需要 5 个字段，当前为 ${fields.length} 个` };

  const parsedFields: ParsedField[] = [];
  for (let index = 0; index < CONFIGS.length; index += 1) {
    const field = parseField(fields[index]!, CONFIGS[index]!);
    if ('error' in field) return field;
    parsedFields.push(field);
  }

  return {
    expression: source,
    minute: parsedFields[0]!,
    hour: parsedFields[1]!,
    dom: parsedFields[2]!,
    month: parsedFields[3]!,
    dow: parsedFields[4]!,
  };
}

function sortedValues(field: ParsedField) {
  return Array.from(field.values).sort((left, right) => left - right);
}

function joinValues(values: number[], formatter: (value: number) => string) {
  const visible = values.slice(0, 12).map(formatter);
  return `${visible.join('、')}${values.length > 12 ? `…（共 ${values.length} 个值）` : ''}`;
}

function describeField(field: ParsedField, config: FieldConfig) {
  if (field.wildcard) {
    const wildcardText: Record<FieldKey, string> = {
      minute: '每分钟',
      hour: '每小时',
      dom: '每天',
      month: '每月',
      dow: '每天（星期不限）',
    };
    return wildcardText[config.key];
  }

  const stepMatch = /^\*\/(\d+)$/.exec(field.raw);
  if (stepMatch && (config.key === 'minute' || config.key === 'hour')) {
    return `每 ${stepMatch[1]}${config.key === 'minute' ? ' 分钟' : ' 小时'}`;
  }

  const values = sortedValues(field);
  if (config.key === 'dow') return joinValues(values, (value) => WEEKDAY_NAMES[value]!);
  if (config.key === 'month') return joinValues(values, (value) => `${value} 月`);
  if (config.key === 'dom') return joinValues(values, (value) => `${value} 日`);
  if (config.key === 'hour') {
    return joinValues(values, (value) => `${String(value).padStart(2, '0')} 时`);
  }
  return joinValues(values, (value) => `${String(value).padStart(2, '0')} 分`);
}

function describeDayRule(parsed: ParsedCron) {
  if (parsed.dom.wildcard && parsed.dow.wildcard) {
    return '日期规则：日与星期均不限，每个符合月份的日期都可匹配。';
  }
  if (parsed.dom.wildcard) return '日期规则：日字段不限，仅按星期字段匹配。';
  if (parsed.dow.wildcard) return '日期规则：星期字段不限，仅按日字段匹配。';
  return '日期规则：日字段与星期字段任一匹配即可（标准 Cron 的 DOM/DOW OR 语义）。';
}

function dayMatches(date: Date, parsed: ParsedCron) {
  const domMatch = parsed.dom.values.has(date.getDate());
  const dowMatch = parsed.dow.values.has(date.getDay());
  if (parsed.dom.wildcard && parsed.dow.wildcard) return true;
  if (parsed.dom.wildcard) return dowMatch;
  if (parsed.dow.wildcard) return domMatch;
  return domMatch || dowMatch;
}

function nextLocalMinute(date: Date) {
  return new Date(Math.floor(date.getTime() / 60000) * 60000 + 60000);
}

function findOccurrences(parsed: ParsedCron, count: number, startDate: Date) {
  const values: Date[] = [];
  let cursor = nextLocalMinute(startDate);
  const limit = new Date(cursor.getTime());
  limit.setFullYear(limit.getFullYear() + 5);
  let iterations = 0;
  const maxIterations = 3_000_000;

  while (values.length < count && cursor <= limit && iterations < maxIterations) {
    iterations += 1;
    if (!parsed.month.values.has(cursor.getMonth() + 1)) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(cursor, parsed)) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0, 0);
      continue;
    }
    if (!parsed.hour.values.has(cursor.getHours())) {
      cursor.setMinutes(0, 0, 0);
      cursor.setHours(cursor.getHours() + 1);
      continue;
    }
    if (!parsed.minute.values.has(cursor.getMinutes())) {
      cursor = new Date(cursor.getTime() + 60000);
      continue;
    }

    values.push(new Date(cursor.getTime()));
    cursor = new Date(cursor.getTime() + 60000);
  }

  return { values, limited: values.length < count };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatDate(date: Date) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} ${WEEKDAY_NAMES[date.getDay()]}`;
}

function clearOutput() {
  CONFIGS.forEach((config) => {
    descriptions[config.key] = '—';
  });
  dayRule.value = '—';
  occurrences.value = [];
  searchNote.value = '';
}

function render() {
  const parsed = parseCron(cronInput.value);
  if ('empty' in parsed) {
    clearOutput();
    message.value = DEFAULT_MESSAGE;
    messageIsError.value = false;
    return;
  }
  if ('error' in parsed) {
    clearOutput();
    message.value = parsed.error;
    messageIsError.value = true;
    return;
  }

  CONFIGS.forEach((config) => {
    descriptions[config.key] = describeField(parsed[config.key], config);
  });
  dayRule.value = describeDayRule(parsed);
  message.value = `表达式有效：${parsed.expression}`;
  messageIsError.value = false;

  const found = findOccurrences(parsed, previewCount.value, new Date());
  occurrences.value = found.values;
  searchNote.value = found.limited
    ? `在未来 5 年的搜索范围内仅找到 ${found.values.length} 次。`
    : '从当前时间的下一分钟开始，按本地时区计算。';
}

function setExample(value: string) {
  cronInput.value = value;
  render();
  void nextTick(() => inputElement.value?.focus());
}

function clearInput() {
  cronInput.value = '';
  render();
  void nextTick(() => inputElement.value?.focus());
}

function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise<void>((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      if (document.execCommand('copy')) resolve();
      else reject(new Error('复制失败'));
    } catch (error) {
      reject(error);
    }
    document.body.removeChild(textarea);
  });
}

async function copyOccurrences() {
  if (!occurrences.value.length) return;
  try {
    await copyText(occurrences.value.map(formatDate).join('\n'));
    copied.value = true;
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    message.value = '复制失败，请手动复制';
    messageIsError.value = true;
  }
}

watch(cronInput, () => {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 120);
});
watch(previewCount, render);

onMounted(render);
onBeforeUnmount(() => {
  window.clearTimeout(renderTimer);
  window.clearTimeout(copiedTimer);
});
</script>

<template>
  <div class="cron-parser">
    <div class="cron-parser__input-row">
      <input
        ref="inputElement"
        v-model="cronInput"
        class="cron-parser__input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="分钟 小时 日 月 星期"
        aria-describedby="cron-parser-message"
      />
      <button class="cron-parser__clear" type="button" @click="clearInput">
        <IconX :size="16" />
        清空
      </button>
    </div>

    <div class="cron-parser__hints" aria-hidden="true">
      <span>分钟 0–59</span>
      <span>小时 0–23</span>
      <span>日 1–31</span>
      <span>月 1–12</span>
      <span>星期 0–7</span>
    </div>
    <p
      id="cron-parser-message"
      class="cron-parser__message"
      :class="{ 'is-error': messageIsError }"
      role="alert"
    >
      {{ message }}
    </p>

    <div class="cron-parser__examples">
      <span>常用</span>
      <button
        v-for="example in EXAMPLES"
        :key="example.value"
        type="button"
        @click="setExample(example.value)"
      >
        {{ example.label }}
      </button>
    </div>

    <h3 class="cron-parser__title">字段解释</h3>
    <div class="cron-parser__fields">
      <article v-for="config in CONFIGS" :key="config.key" class="cron-parser__field">
        <h4>{{ config.label }}</h4>
        <p>{{ descriptions[config.key] }}</p>
      </article>
    </div>
    <p class="cron-parser__day-rule">{{ dayRule }}</p>

    <div class="cron-parser__future-head">
      <h3 class="cron-parser__title">未来执行时间</h3>
      <div class="cron-parser__future-actions">
        <select v-model="previewCount" aria-label="预览次数">
          <option :value="5">5 次</option>
          <option :value="10">10 次</option>
          <option :value="15">15 次</option>
          <option :value="20">20 次</option>
        </select>
        <button
          class="cron-parser__copy"
          :class="{ 'is-copied': copied }"
          type="button"
          :disabled="!occurrences.length"
          @click="copyOccurrences"
        >
          <IconCheck v-if="copied" :size="16" />
          <IconCopy v-else :size="16" />
          {{ copied ? '已复制' : '复制全部' }}
        </button>
      </div>
    </div>

    <ol v-if="occurrences.length" class="cron-parser__future-list">
      <li v-for="(date, index) in occurrences" :key="date.getTime()">
        <span>{{ index + 1 }}</span>
        <time :datetime="date.toISOString()">{{ formatDate(date) }}</time>
      </li>
    </ol>
    <div v-else class="cron-parser__empty">
      {{ messageIsError || !cronInput.trim() ? '请输入有效表达式' : '未来 5 年内未找到执行时间' }}
    </div>
    <p class="cron-parser__search-note">{{ searchNote }}</p>
    <p class="cron-parser__rule">
      支持 <code>*</code>、逗号列表、连字符范围与斜杠步长，也支持 JAN–DEC、SUN–SAT
      英文缩写。预览从下一分钟开始，最多向后搜索 5 年。
    </p>
  </div>
</template>

<style scoped>
.cron-parser {
  display: grid;
  gap: 0;
}

.cron-parser__input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cron-parser__input {
  width: 100%;
  height: 44px;
  padding: 0 13px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  outline: none;
  background: var(--color-surface-soft);
  color: var(--color-text);
  font:
    1rem 'SFMono-Regular',
    Consolas,
    'Liberation Mono',
    monospace;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    background 0.2s;
}

.cron-parser__input:focus {
  border-color: var(--tools-accent);
  background: var(--color-surface-solid);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 10%, transparent);
}

.cron-parser__clear,
.cron-parser__copy {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-solid);
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 13px;
  transition:
    border-color 0.2s,
    color 0.2s,
    background 0.2s;
}

.cron-parser__clear:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.cron-parser__hints {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  text-align: center;
}

.cron-parser__hints span {
  padding: 4px;
  border-radius: 5px;
  background: var(--color-surface-soft);
}

.cron-parser__message {
  min-height: 21px;
  margin: 6px 0 10px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.cron-parser__message.is-error {
  color: var(--color-danger);
}

.cron-parser__examples {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.cron-parser__examples button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 11px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-surface-solid);
  color: var(--color-text-muted);
  cursor: pointer;
  font:
    0.75rem 'SFMono-Regular',
    Consolas,
    'Liberation Mono',
    monospace;
  transition:
    border-color 0.2s,
    color 0.2s;
}

.cron-parser__examples button:hover {
  border-color: var(--tools-accent);
  color: var(--tools-accent);
}

.cron-parser__title {
  margin: 0 0 11px;
  color: var(--color-text);
  font-size: 0.94rem;
  font-weight: 600;
}

.cron-parser__fields {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.cron-parser__field {
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--tools-accent) 24%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--tools-accent) 6%, var(--color-surface-solid));
}

.cron-parser__field h4,
.cron-parser__field p {
  margin: 0;
}

.cron-parser__field h4 {
  margin-bottom: 6px;
  color: var(--tools-accent);
  font-size: 0.76rem;
  font-weight: 600;
}

.cron-parser__field p {
  color: var(--color-text);
  font-size: 0.8rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.cron-parser__day-rule {
  margin: 11px 0 20px;
  padding: 10px 13px;
  border-left: 3px solid var(--tools-accent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--tools-accent) 6%, var(--color-surface-soft));
  color: var(--color-text-muted);
  font-size: 0.78rem;
  line-height: 1.6;
}

.cron-parser__future-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}

.cron-parser__future-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cron-parser__future-actions select {
  flex: none;
  height: 44px;
  padding: 0 11px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  outline: none;
  background: var(--color-surface-solid);
  color: var(--color-text);
  font-size: 13px;
}

.cron-parser__copy:hover:not(:disabled) {
  border-color: var(--tools-accent);
  color: var(--tools-accent);
}

.cron-parser__copy:disabled {
  cursor: default;
  opacity: 0.45;
}

.cron-parser__copy.is-copied {
  border-color: var(--tools-accent);
  background: var(--tools-accent);
  color: white;
}

.cron-parser__future-list {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.cron-parser__future-list li {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  font:
    0.88rem 'SFMono-Regular',
    Consolas,
    'Liberation Mono',
    monospace;
}

.cron-parser__future-list li:first-child {
  border-top: 1px solid var(--color-border);
}

.cron-parser__future-list li span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--tools-accent) 12%, var(--color-surface-solid));
  color: var(--tools-accent);
  font-size: 0.72rem;
}

.cron-parser__empty {
  margin-top: 10px;
  padding: 20px 12px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  color: var(--color-text-muted);
  text-align: center;
}

.cron-parser__search-note {
  min-height: 20px;
  margin: 7px 0 0;
  color: var(--color-text-muted);
  font-size: 0.74rem;
}

.cron-parser__rule {
  margin: 17px 0 0;
  color: var(--color-text-muted);
  font-size: 0.76rem;
  line-height: 1.7;
}

.cron-parser__rule code {
  color: var(--tools-accent);
}

@media (max-width: 850px) {
  .cron-parser__fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .cron-parser__input-row,
  .cron-parser__future-head {
    align-items: stretch;
    flex-direction: column;
  }

  .cron-parser__hints {
    font-size: 0.64rem;
  }

  .cron-parser__fields {
    grid-template-columns: 1fr;
  }

  .cron-parser__future-actions {
    justify-content: space-between;
  }

  .cron-parser__future-list li {
    font-size: 0.78rem;
  }

  .cron-parser__examples button {
    min-height: 44px;
    font-size: 13px;
  }
}
</style>
