<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { IconCalculator, IconTrash } from '@tabler/icons-vue';
import { STORAGE_POLICY } from '@/core/privacy/storage';

type Operator = '+' | '-' | '*' | '/' | '(' | ')';
type Token = { type: 'number'; value: number } | { type: Operator; value: Operator };
type CalculationResult =
  { valid: true; mode: 'formula' | 'sum'; value: number } | { valid: false; error: string };

interface LineResult {
  line: number;
  source: string;
  result: CalculationResult;
}

const STORAGE_KEY = `${STORAGE_POLICY.preferences}:calculation-paper-draft`;
const input = ref('');
const saveStatus = ref('草稿仅保存在当前浏览器');
const saveError = ref(false);
let ready = false;
let skipNextSave = false;
let saveTimer: number | null = null;

function normalizeText(text: string): string {
  return text
    .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 65248))
    .replace(/[＋]/g, '+')
    .replace(/[－−]/g, '-')
    .replace(/[×＊]/g, '*')
    .replace(/[÷／]/g, '/')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[，]/g, ',')
    .replace(/[．]/g, '.');
}

function readNumber(text: string, start: number): { raw: string; end: number } | null {
  const matched = text.slice(start).match(/^(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/);
  return matched ? { raw: matched[0], end: start + matched[0].length } : null;
}

function tokenize(text: string): {
  tokens: Token[];
  hasNumber: boolean;
  hasExpressionSymbol: boolean;
} {
  const source = normalizeText(text);
  const tokens: Token[] = [];
  let hasNumber = false;
  let hasExpressionSymbol = false;
  let position = 0;

  while (position < source.length) {
    const character = source.charAt(position);
    const number = readNumber(source, position);
    if (number) {
      tokens.push({ type: 'number', value: Number(number.raw.replace(/,/g, '')) });
      hasNumber = true;
      position = number.end;
    } else if ('+-*/()'.includes(character)) {
      const operator = character as Operator;
      tokens.push({ type: operator, value: operator });
      hasExpressionSymbol = true;
      position += 1;
    } else {
      position += 1;
    }
  }

  return { tokens, hasNumber, hasExpressionSymbol };
}

class ExpressionParser {
  private position = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  private current(): Token | undefined {
    return this.tokens[this.position];
  }

  private consume(type: Operator): Token | null {
    const token = this.current();
    if (!token || token.type !== type) return null;
    this.position += 1;
    return token;
  }

  parse(): number {
    const value = this.parseExpression();
    if (this.current()) throw new Error('缺少运算符或括号不匹配');
    if (!Number.isFinite(value)) throw new Error('计算结果无效');
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    let token = this.current();
    while (token && (token.type === '+' || token.type === '-')) {
      this.position += 1;
      const right = this.parseTerm();
      value = token.type === '+' ? value + right : value - right;
      token = this.current();
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    let token = this.current();
    while (token && (token.type === '*' || token.type === '/')) {
      this.position += 1;
      const right = this.parseFactor();
      if (token.type === '/' && right === 0) throw new Error('除数不能为 0');
      value = token.type === '*' ? value * right : value / right;
      token = this.current();
    }
    return value;
  }

  private parseFactor(): number {
    const token = this.current();
    if (!token) throw new Error('缺少操作数');

    if (token.type === '+' || token.type === '-') {
      this.position += 1;
      const value = this.parseFactor();
      return token.type === '-' ? -value : value;
    }
    if (token.type === 'number') {
      this.position += 1;
      return token.value;
    }
    if (token.type === '(') {
      this.position += 1;
      const value = this.parseExpression();
      if (!this.consume(')')) throw new Error('缺少右括号');
      return value;
    }
    throw new Error('缺少操作数');
  }
}

function calculateLine(text: string): CalculationResult {
  const parsed = tokenize(text);
  if (!parsed.hasNumber) return { valid: false, error: '未识别到数字' };

  if (parsed.hasExpressionSymbol) {
    try {
      return { valid: true, mode: 'formula', value: new ExpressionParser(parsed.tokens).parse() };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : '公式不完整',
      };
    }
  }

  return {
    valid: true,
    mode: 'sum',
    value: parsed.tokens.reduce(
      (total, token) => total + (token.type === 'number' ? token.value : 0),
      0,
    ),
  };
}

function formatNumber(value: number): string {
  let rounded = Math.round((value + Number.EPSILON) * 1_000_000_000_000) / 1_000_000_000_000;
  if (Math.abs(rounded) < 0.000_000_000_001) rounded = 0;
  return rounded.toLocaleString('zh-CN', { useGrouping: false, maximumFractionDigits: 12 });
}

const results = computed<LineResult[]>(() =>
  input.value
    .split(/\r?\n/)
    .map((source, index) => ({ line: index + 1, source, result: calculateLine(source) }))
    .filter((item) => item.source.trim()),
);
const validResults = computed(() => results.value.filter((item) => item.result.valid));
const total = computed(() =>
  validResults.value.reduce((sum, item) => sum + (item.result.valid ? item.result.value : 0), 0),
);

function setSaveStatus(text: string, isError = false): void {
  saveStatus.value = text;
  saveError.value = isError;
}

function saveDraft(): void {
  try {
    if (input.value) localStorage.setItem(STORAGE_KEY, input.value);
    else localStorage.removeItem(STORAGE_KEY);
    setSaveStatus(input.value ? '已自动保存至本地' : '草稿已清空');
  } catch {
    setSaveStatus('浏览器无法保存草稿', true);
  }
}

function queueSave(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  setSaveStatus('正在保存…');
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveDraft();
  }, 250);
}

function clearDraft(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = null;
  if (input.value) skipNextSave = true;
  input.value = '';
  try {
    localStorage.removeItem(STORAGE_KEY);
    setSaveStatus('草稿已清空');
  } catch {
    setSaveStatus('浏览器无法清空草稿', true);
  }
}

watch(input, () => {
  if (skipNextSave) {
    skipNextSave = false;
    return;
  }
  if (ready) queueSave();
});

onMounted(() => {
  try {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    if (savedDraft) {
      skipNextSave = true;
      input.value = savedDraft;
      setSaveStatus('已恢复本地草稿');
    }
  } catch {
    setSaveStatus('浏览器无法读取草稿', true);
  }
  ready = true;
});

onBeforeUnmount(() => {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
});
</script>

<template>
  <div class="calculation-paper">
    <div class="calculation-paper__toolbar">
      <span :class="['calculation-paper__save-status', { 'is-error': saveError }]">
        {{ saveStatus }}
      </span>
      <button type="button" class="tool-button tool-button--quiet" @click="clearDraft">
        <IconTrash :size="16" aria-hidden="true" />清空
      </button>
    </div>

    <div class="calculation-paper__columns">
      <section class="calculation-paper__column">
        <header class="calculation-paper__column-head">
          <strong>输入</strong>
          <span>每行独立计算</span>
        </header>
        <textarea
          v-model="input"
          class="calculation-paper__input"
          spellcheck="false"
          placeholder="例如：&#10;苹果 12 + 香蕉 8&#10;买菜 12 元，饮料 8.5 元&#10;2 × (3 + 4)"
          aria-label="计算稿纸输入"
        ></textarea>
      </section>

      <section class="calculation-paper__column">
        <header class="calculation-paper__column-head">
          <strong>计算结果</strong>
          <span>自动更新</span>
        </header>
        <div class="calculation-paper__result-panel">
          <div class="calculation-paper__summary">
            <span>有效行合计</span>
            <strong>{{ validResults.length ? formatNumber(total) : '—' }}</strong>
          </div>
          <ul v-if="results.length" class="calculation-paper__results">
            <li v-for="item in results" :key="item.line">
              <div class="calculation-paper__meta">
                <span>第 {{ item.line }} 行</span>
                <small
                  :class="{
                    'is-sum': item.result.valid && item.result.mode === 'sum',
                    'is-error': !item.result.valid,
                  }"
                >
                  {{
                    item.result.valid
                      ? item.result.mode === 'formula'
                        ? '公式计算'
                        : '提取求和'
                      : '无法计算'
                  }}
                </small>
              </div>
              <p :title="item.source">{{ item.source }}</p>
              <strong v-if="item.result.valid">= {{ formatNumber(item.result.value) }}</strong>
              <em v-else>{{ item.result.error }}</em>
            </li>
          </ul>
          <div v-else class="calculation-paper__empty">
            <IconCalculator :size="34" aria-hidden="true" />
            <span>输入文本后，将在这里显示每行结果</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.calculation-paper {
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-solid);
}
.calculation-paper__toolbar,
.calculation-paper__column-head,
.calculation-paper__summary,
.calculation-paper__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.calculation-paper__toolbar {
  min-height: 38px;
  margin-bottom: 16px;
}
.calculation-paper__save-status,
.calculation-paper__column-head span {
  color: var(--color-text-muted);
  font-size: 11px;
}
.calculation-paper__save-status.is-error {
  color: var(--color-danger);
}
.calculation-paper__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}
.calculation-paper__column {
  min-width: 0;
}
.calculation-paper__column-head {
  min-height: 32px;
  margin-bottom: 8px;
}
.calculation-paper__column-head strong {
  color: var(--color-text);
  font-size: 12px;
}
.calculation-paper__input,
.calculation-paper__result-panel {
  width: 100%;
  min-height: 360px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-soft);
}
.calculation-paper__input {
  display: block;
  padding: 14px 16px;
  outline: none;
  color: var(--color-text);
  box-sizing: border-box;
  font:
    12px/1.7 'SFMono-Regular',
    Consolas,
    monospace;
  resize: vertical;
  transition:
    border-color 0.2s,
    background 0.2s,
    box-shadow 0.2s;
}
.calculation-paper__input:focus {
  border-color: var(--tools-accent);
  background: var(--color-surface-solid);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 10%, transparent);
}
.calculation-paper__result-panel {
  overflow: hidden;
}
.calculation-paper__summary {
  min-height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--tools-accent) 18%, var(--color-border));
  background: color-mix(in srgb, var(--tools-accent) 8%, var(--color-surface-solid));
}
.calculation-paper__summary span {
  color: var(--tools-accent);
  font-size: 11px;
  font-weight: 700;
}
.calculation-paper__summary strong {
  color: color-mix(in srgb, var(--tools-accent) 86%, var(--color-text));
  font:
    600 15px 'SFMono-Regular',
    Consolas,
    monospace;
  word-break: break-all;
}
.calculation-paper__results {
  margin: 0;
  padding: 0;
  list-style: none;
}
.calculation-paper__results li {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
}
.calculation-paper__results li:last-child {
  border-bottom: 0;
}
.calculation-paper__meta {
  justify-content: flex-start;
  gap: 7px;
}
.calculation-paper__meta > span {
  color: var(--color-text-muted);
  font-size: 10px;
}
.calculation-paper__meta small {
  padding: 2px 7px;
  border-radius: 10px;
  color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 10%, var(--color-surface-solid));
  font-size: 9px;
}
.calculation-paper__meta small.is-sum {
  color: #4b7bb7;
  background: color-mix(in srgb, #4b7bb7 10%, var(--color-surface-solid));
}
.calculation-paper__meta small.is-error {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface-solid));
}
.calculation-paper__results p {
  overflow: hidden;
  margin: 6px 0 4px;
  color: var(--color-text-muted);
  font:
    11px/1.45 'SFMono-Regular',
    Consolas,
    monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.calculation-paper__results > li > strong {
  color: var(--color-text);
  font:
    600 14px 'SFMono-Regular',
    Consolas,
    monospace;
  word-break: break-all;
}
.calculation-paper__results em {
  color: var(--color-danger);
  font-size: 11px;
  font-style: normal;
}
.calculation-paper__empty {
  display: grid;
  min-height: 300px;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--color-text-muted);
  font-size: 11px;
}
@media (max-width: 760px) {
  .calculation-paper__columns {
    grid-template-columns: 1fr;
  }
  .calculation-paper__input,
  .calculation-paper__result-panel {
    min-height: 240px;
  }
}
</style>
