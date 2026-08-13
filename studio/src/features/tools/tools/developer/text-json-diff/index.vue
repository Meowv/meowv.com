<script setup lang="ts">
import {
  IconArrowsExchange,
  IconBraces,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconColumns,
  IconCopy,
  IconFileText,
  IconListDetails,
  IconSettings,
  IconSparkles,
  IconTrash,
  IconX,
} from '@tabler/icons-vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MonacoDiffEditor from './MonacoDiffEditor.vue';
import {
  compareJson,
  compareText,
  describeJsonValue,
  presentJson,
  type DiffMode,
  type IgnoreRules,
  type JsonPresentation,
  type StructuralDifference,
  type StructuralDiffKind,
  type TextDifference,
  type TextGranularity,
} from './diff-engine';

interface DiffEditorHandle {
  reveal(originalLine: number, modifiedLine: number): void;
  goToDiff(direction: 'next' | 'previous'): void;
}

interface Preferences {
  mode: DiffMode;
  granularity: TextGranularity;
  ignoreCase: boolean;
  ignoreWhitespace: boolean;
  ignoreBlankLines: boolean;
  panelOpen: boolean;
  sideBySide: boolean;
}

const PREFERENCES_KEY = 'meowv-studio:preferences:v1:text-json-diff';
const COMPARE_DELAY = 250;

const TEXT_EXAMPLE = {
  original: `# Studio 1.8.0 发布说明

- API 地址：https://api.example.com/v1
- 支持 Unicode：你好，世界 👋
- 修复导出文件名偶尔为空的问题
- 优化编辑器启动速度`,
  modified: `# Studio 1.9.0 发布说明

- API 地址：https://api.example.com/v2
- 支持 Unicode：你好，世界 🌍
- 修复导出文件名偶尔为空的问题
- 优化编辑器启动与预加载速度
- 新增：任意文本对比`,
};

const JSON_EXAMPLE = {
  original: JSON.stringify(
    {
      appConfig: {
        theme: 'light',
        notifications: { email: true, desktop: false },
        security: { twoFactor: false, sessionMinutes: 60 },
        performance: { cache: true, workers: 2 },
        preload: ['editor', 'assets'],
      },
    },
    null,
    2,
  ),
  modified: JSON.stringify(
    {
      appConfig: {
        theme: 'dark',
        notifications: { email: true, desktop: true, sound: false },
        security: { twoFactor: true, sessionMinutes: '30' },
        performance: { cache: true, workers: 4 },
        preload: ['editor', 'workspace', 'assets'],
      },
    },
    null,
    2,
  ),
};

const editorRef = ref<DiffEditorHandle | null>(null);
const mode = ref<DiffMode>('text');
const granularity = ref<TextGranularity>('line');
const ignoreCase = ref(false);
const ignoreWhitespace = ref(false);
const ignoreBlankLines = ref(false);
const panelOpen = ref(true);
const sideBySide = ref(true);
const originalText = ref('');
const modifiedText = ref('');
const originalJson = ref('');
const modifiedJson = ref('');
const originalJsonError = ref('');
const modifiedJsonError = ref('');
const originalPresentation = ref<JsonPresentation | null>(null);
const modifiedPresentation = ref<JsonPresentation | null>(null);
const textDifferences = ref<TextDifference[]>([]);
const structuralDifferences = ref<StructuralDifference[]>([]);
const currentDifference = ref(0);
const comparing = ref(false);
const copiedSide = ref<'original' | 'modified' | null>(null);
const actionMessage = ref('');
const actionTone = ref<'success' | 'error'>('success');
let compareTimer: ReturnType<typeof setTimeout> | undefined;
let actionTimer: ReturnType<typeof setTimeout> | undefined;

const originalContent = computed({
  get: () => (mode.value === 'text' ? originalText.value : originalJson.value),
  set: (value: string) => {
    if (mode.value === 'text') originalText.value = value;
    else originalJson.value = value;
  },
});
const modifiedContent = computed({
  get: () => (mode.value === 'text' ? modifiedText.value : modifiedJson.value),
  set: (value: string) => {
    if (mode.value === 'text') modifiedText.value = value;
    else modifiedJson.value = value;
  },
});
const ignoreRules = computed<IgnoreRules>(() => ({
  case: ignoreCase.value,
  whitespace: ignoreWhitespace.value,
  blankLines: ignoreBlankLines.value,
}));
const differenceCount = computed(() =>
  mode.value === 'json' ? structuralDifferences.value.length : textDifferences.value.length,
);
const counterLabel = computed(() => {
  if (comparing.value) return '比较中…';
  if (mode.value === 'json' && (originalJsonError.value || modifiedJsonError.value)) return '— / —';
  return differenceCount.value ? `${currentDifference.value} / ${differenceCount.value}` : '0 / 0';
});
const language = computed(() => (mode.value === 'json' ? 'json' : 'plaintext'));
const structuralSummary = computed(() => {
  const totals: Record<StructuralDiffKind, number> = {
    added: 0,
    removed: 0,
    modified: 0,
    'type-changed': 0,
  };
  for (const difference of structuralDifferences.value) totals[difference.kind] += 1;
  return totals;
});

function jsonError(error: unknown): string {
  return error instanceof Error ? error.message : 'JSON 格式无效。';
}

function parsePresentation(input: string, side: 'original' | 'modified'): JsonPresentation | null {
  if (!input.trim()) {
    if (side === 'original') originalJsonError.value = '';
    else modifiedJsonError.value = '';
    return null;
  }
  try {
    const presentation = presentJson(input);
    if (side === 'original') originalJsonError.value = '';
    else modifiedJsonError.value = '';
    return presentation;
  } catch (error) {
    const message = jsonError(error);
    if (side === 'original') originalJsonError.value = message;
    else modifiedJsonError.value = message;
    return null;
  }
}

function compareNow(): void {
  comparing.value = false;
  if (mode.value === 'text') {
    textDifferences.value = compareText(
      originalText.value,
      modifiedText.value,
      granularity.value,
      ignoreRules.value,
    );
  } else {
    const nextOriginal = parsePresentation(originalJson.value, 'original');
    const nextModified = parsePresentation(modifiedJson.value, 'modified');
    originalPresentation.value = nextOriginal;
    modifiedPresentation.value = nextModified;
    structuralDifferences.value =
      nextOriginal && nextModified ? compareJson(nextOriginal, nextModified) : [];
    if (nextOriginal && nextOriginal.text !== originalJson.value) {
      originalJson.value = nextOriginal.text;
    }
    if (nextModified && nextModified.text !== modifiedJson.value) {
      modifiedJson.value = nextModified.text;
    }
  }
  currentDifference.value = differenceCount.value ? 1 : 0;
}

function scheduleCompare(): void {
  comparing.value = true;
  clearTimeout(compareTimer);
  compareTimer = setTimeout(compareNow, COMPARE_DELAY);
}

function setMode(nextMode: DiffMode): void {
  mode.value = nextMode;
}

function loadExample(): void {
  if (mode.value === 'text') {
    originalText.value = TEXT_EXAMPLE.original;
    modifiedText.value = TEXT_EXAMPLE.modified;
  } else {
    originalJson.value = JSON_EXAMPLE.original;
    modifiedJson.value = JSON_EXAMPLE.modified;
  }
}

function swapContent(): void {
  if (mode.value === 'text') {
    [originalText.value, modifiedText.value] = [modifiedText.value, originalText.value];
  } else {
    [originalJson.value, modifiedJson.value] = [modifiedJson.value, originalJson.value];
  }
}

function showAction(message: string, tone: 'success' | 'error' = 'success'): void {
  actionMessage.value = message;
  actionTone.value = tone;
  clearTimeout(actionTimer);
  actionTimer = setTimeout(
    () => {
      actionMessage.value = '';
    },
    tone === 'error' ? 3200 : 1600,
  );
}

function clearSide(side: 'original' | 'modified'): void {
  if (side === 'original') originalContent.value = '';
  else modifiedContent.value = '';
  showAction(side === 'original' ? '原始内容已清空' : '修改后内容已清空');
}

async function copySide(side: 'original' | 'modified'): Promise<void> {
  try {
    await navigator.clipboard.writeText(
      side === 'original' ? originalContent.value : modifiedContent.value,
    );
    copiedSide.value = side;
    showAction(side === 'original' ? '原始内容已复制' : '修改后内容已复制');
    window.setTimeout(() => {
      if (copiedSide.value === side) copiedSide.value = null;
    }, 1600);
  } catch {
    showAction('复制失败，请检查浏览器剪贴板权限。', 'error');
  }
}

function revealDifference(index: number): void {
  const total = differenceCount.value;
  if (!total) return;
  const normalizedIndex = ((index % total) + total) % total;
  currentDifference.value = normalizedIndex + 1;
  if (mode.value === 'text') {
    const difference = textDifferences.value[normalizedIndex];
    if (difference) editorRef.value?.reveal(difference.originalLine, difference.modifiedLine);
    return;
  }
  const difference = structuralDifferences.value[normalizedIndex];
  if (!difference) return;
  editorRef.value?.reveal(difference.originalLine ?? 1, difference.modifiedLine ?? 1);
}

function moveDifference(direction: 'previous' | 'next'): void {
  if (!differenceCount.value) return;
  revealDifference(currentDifference.value - 1 + (direction === 'next' ? 1 : -1));
}

function kindLabel(kind: StructuralDiffKind): string {
  return {
    added: '新增',
    removed: '删除',
    modified: '修改',
    'type-changed': '类型变化',
  }[kind];
}

function describeDifference(difference: StructuralDifference): string {
  if (difference.kind === 'added') return describeJsonValue(difference.modifiedValue);
  if (difference.kind === 'removed') return describeJsonValue(difference.originalValue);
  return `${describeJsonValue(difference.originalValue)} → ${describeJsonValue(
    difference.modifiedValue,
  )}`;
}

function restorePreferences(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '') as Partial<Preferences>;
    if (saved.mode === 'text' || saved.mode === 'json') mode.value = saved.mode;
    if (saved.granularity && ['line', 'word', 'character'].includes(saved.granularity)) {
      granularity.value = saved.granularity;
    }
    ignoreCase.value = Boolean(saved.ignoreCase);
    ignoreWhitespace.value = Boolean(saved.ignoreWhitespace);
    ignoreBlankLines.value = Boolean(saved.ignoreBlankLines);
    if (typeof saved.panelOpen === 'boolean') panelOpen.value = saved.panelOpen;
    if (typeof saved.sideBySide === 'boolean') sideBySide.value = saved.sideBySide;
  } catch {
    // 偏好损坏时沿用默认设置，输入内容从不写入本地存储。
  }
}

function persistPreferences(): void {
  const preferences: Preferences = {
    mode: mode.value,
    granularity: granularity.value,
    ignoreCase: ignoreCase.value,
    ignoreWhitespace: ignoreWhitespace.value,
    ignoreBlankLines: ignoreBlankLines.value,
    panelOpen: panelOpen.value,
    sideBySide: sideBySide.value,
  };
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // 隐私模式下存储不可用不影响核心对比能力。
  }
}

watch(
  [
    originalContent,
    modifiedContent,
    mode,
    granularity,
    ignoreCase,
    ignoreWhitespace,
    ignoreBlankLines,
  ],
  scheduleCompare,
);
watch(
  [mode, granularity, ignoreCase, ignoreWhitespace, ignoreBlankLines, panelOpen, sideBySide],
  persistPreferences,
);

onMounted(() => {
  restorePreferences();
  compareNow();
});
onBeforeUnmount(() => {
  clearTimeout(compareTimer);
  clearTimeout(actionTimer);
});
</script>

<template>
  <section class="diff-tool" aria-label="文本与 JSON 对比">
    <header class="diff-toolbar">
      <div class="diff-toolbar__group diff-toolbar__modes" aria-label="对比模式">
        <button
          type="button"
          :class="{ 'is-active': mode === 'text' }"
          :aria-pressed="mode === 'text'"
          @click="setMode('text')"
        >
          <IconFileText :size="16" aria-hidden="true" />文本
        </button>
        <button
          type="button"
          :class="{ 'is-active': mode === 'json' }"
          :aria-pressed="mode === 'json'"
          @click="setMode('json')"
        >
          <IconBraces :size="16" aria-hidden="true" />JSON
        </button>
      </div>

      <div v-if="mode === 'text'" class="diff-toolbar__group diff-toolbar__granularity">
        <span>粒度</span>
        <select v-model="granularity" aria-label="文本对比粒度">
          <option value="line">按行</option>
          <option value="word">按单词</option>
          <option value="character">按字符</option>
        </select>
      </div>

      <div class="diff-toolbar__spacer"></div>
      <div class="diff-toolbar__navigation" aria-label="差异导航">
        <span class="diff-toolbar__counter" aria-live="polite">{{ counterLabel }}</span>
        <button
          type="button"
          aria-label="上一个差异"
          title="上一个差异"
          @click="moveDifference('previous')"
        >
          <IconChevronUp :size="17" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="下一个差异"
          title="下一个差异"
          @click="moveDifference('next')"
        >
          <IconChevronDown :size="17" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        class="diff-toolbar__icon"
        aria-label="交换两侧内容"
        title="交换"
        @click="swapContent"
      >
        <IconArrowsExchange :size="18" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="diff-toolbar__icon"
        aria-label="载入示例"
        title="载入示例"
        @click="loadExample"
      >
        <IconSparkles :size="18" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="diff-toolbar__icon diff-toolbar__layout"
        :class="{ 'is-active': sideBySide }"
        :aria-pressed="sideBySide"
        :aria-label="sideBySide ? '切换为行内对比' : '切换为并排对比'"
        :title="sideBySide ? '行内对比' : '并排对比'"
        @click="sideBySide = !sideBySide"
      >
        <IconColumns :size="18" aria-hidden="true" />
      </button>
      <button
        v-if="mode === 'json' && !panelOpen"
        type="button"
        class="diff-toolbar__icon"
        aria-label="打开结构化差异"
        title="结构化差异"
        @click="panelOpen = true"
      >
        <IconListDetails :size="18" aria-hidden="true" />
      </button>
      <details class="diff-settings">
        <summary aria-label="对比设置" title="设置">
          <IconSettings :size="18" aria-hidden="true" />
        </summary>
        <div class="diff-settings__popover">
          <strong>忽略规则</strong>
          <label><input v-model="ignoreCase" type="checkbox" />忽略大小写</label>
          <label><input v-model="ignoreWhitespace" type="checkbox" />忽略空白差异</label>
          <label><input v-model="ignoreBlankLines" type="checkbox" />忽略空行</label>
          <p>设置只保存在浏览器，不会保存输入内容。</p>
        </div>
      </details>
      <span
        v-if="actionMessage"
        class="diff-toolbar__message"
        :class="`is-${actionTone}`"
        :role="actionTone === 'error' ? 'alert' : 'status'"
      >
        {{ actionMessage }}
      </span>
    </header>

    <div
      v-if="mode === 'json' && (originalJsonError || modifiedJsonError)"
      class="diff-json-errors"
    >
      <p v-if="originalJsonError"><strong>原始 JSON：</strong>{{ originalJsonError }}</p>
      <p v-if="modifiedJsonError"><strong>修改后 JSON：</strong>{{ modifiedJsonError }}</p>
    </div>

    <div class="diff-workspace" :class="{ 'has-structure-panel': mode === 'json' && panelOpen }">
      <div class="diff-editor-pane">
        <div class="diff-editor-labels">
          <div>
            <strong>原始内容</strong>
            <span>
              <button
                type="button"
                title="复制原始内容"
                aria-label="复制原始内容"
                @click="copySide('original')"
              >
                <IconCheck v-if="copiedSide === 'original'" :size="15" aria-hidden="true" />
                <IconCopy v-else :size="15" aria-hidden="true" />
              </button>
              <button
                type="button"
                title="清空原始内容"
                aria-label="清空原始内容"
                @click="clearSide('original')"
              >
                <IconTrash :size="15" aria-hidden="true" />
              </button>
            </span>
          </div>
          <div>
            <strong>修改后内容</strong>
            <span>
              <button
                type="button"
                title="复制修改后内容"
                aria-label="复制修改后内容"
                @click="copySide('modified')"
              >
                <IconCheck v-if="copiedSide === 'modified'" :size="15" aria-hidden="true" />
                <IconCopy v-else :size="15" aria-hidden="true" />
              </button>
              <button
                type="button"
                title="清空修改后内容"
                aria-label="清空修改后内容"
                @click="clearSide('modified')"
              >
                <IconTrash :size="15" aria-hidden="true" />
              </button>
            </span>
          </div>
        </div>
        <MonacoDiffEditor
          ref="editorRef"
          v-model:original="originalContent"
          v-model:modified="modifiedContent"
          :language="language"
          :granularity="granularity"
          :ignore-case="ignoreCase"
          :ignore-whitespace="ignoreWhitespace"
          :ignore-blank-lines="ignoreBlankLines"
          :ignore-trim-whitespace="ignoreWhitespace"
          :render-side-by-side="sideBySide"
        />
      </div>

      <aside v-if="mode === 'json' && panelOpen" class="structure-panel" aria-label="结构化差异">
        <header>
          <div>
            <strong>结构化差异</strong>
            <span>{{ structuralDifferences.length }} 项</span>
          </div>
          <button type="button" aria-label="关闭结构化差异" @click="panelOpen = false">
            <IconX :size="17" aria-hidden="true" />
          </button>
        </header>
        <div v-if="structuralDifferences.length" class="structure-panel__summary">
          <span class="is-added">+{{ structuralSummary.added }}</span>
          <span class="is-removed">−{{ structuralSummary.removed }}</span>
          <span class="is-modified">~{{ structuralSummary.modified }}</span>
          <span class="is-type-changed">T{{ structuralSummary['type-changed'] }}</span>
        </div>
        <ol v-if="structuralDifferences.length" class="structure-panel__list">
          <li
            v-for="(difference, index) in structuralDifferences"
            :key="`${difference.kind}:${difference.pointer}`"
          >
            <button type="button" @click="revealDifference(index)">
              <span class="structure-panel__kind" :class="`is-${difference.kind}`">{{
                kindLabel(difference.kind)
              }}</span>
              <code>{{ difference.pointer || '(根节点)' }}</code>
              <small>{{ describeDifference(difference) }}</small>
            </button>
          </li>
        </ol>
        <div v-else class="structure-panel__empty">
          <IconListDetails :size="26" aria-hidden="true" />
          <p>
            {{
              originalJsonError || modifiedJsonError ? '修正 JSON 后显示结构差异' : '未发现结构差异'
            }}
          </p>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.diff-tool {
  display: flex;
  min-width: 0;
  min-height: max(620px, calc(100dvh - var(--header-height) - 226px));
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 13px;
  background: var(--color-surface-solid);
  box-shadow: 0 4px 18px rgb(16 24 40 / 3%);
  flex-direction: column;
}

.diff-toolbar {
  position: relative;
  z-index: 8;
  display: flex;
  min-height: 48px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  gap: 5px;
  background: color-mix(in srgb, var(--color-surface-solid) 94%, var(--color-surface-soft));
}

.diff-toolbar button,
.diff-settings summary {
  display: inline-flex;
  min-height: 32px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.diff-toolbar button:hover,
.diff-toolbar button:focus-visible,
.diff-settings summary:hover,
.diff-settings summary:focus-visible,
.diff-toolbar button.is-active {
  outline: 0;
  background: color-mix(in srgb, var(--tools-accent) 10%, transparent);
  color: var(--tools-accent);
}

.diff-toolbar__group {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  align-items: center;
  background: var(--color-surface-soft);
}

.diff-toolbar__modes button.is-active {
  background: var(--color-surface-solid);
  box-shadow: 0 1px 5px rgb(15 23 42 / 8%);
}

.diff-toolbar__granularity {
  padding-left: 9px;
  color: var(--color-text-muted);
  font-size: 11px;
  gap: 4px;
}

.diff-toolbar__granularity select {
  min-height: 28px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
}

.diff-toolbar__spacer {
  flex: 1;
}

.diff-toolbar__message {
  position: absolute;
  z-index: 32;
  top: calc(100% + 7px);
  right: 8px;
  max-width: min(360px, calc(100% - 16px));
  padding: 6px 9px;
  border: 1px solid color-mix(in srgb, #43a047 30%, var(--color-border));
  border-radius: 7px;
  background: color-mix(in srgb, #43a047 8%, var(--color-surface-solid));
  color: #388e3c;
  box-shadow: 0 7px 20px rgb(15 23 42 / 11%);
  font-size: 10px;
}

.diff-toolbar__message.is-error {
  border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 8%, var(--color-surface-solid));
  color: var(--color-danger);
}

.diff-toolbar__navigation {
  display: inline-flex;
  min-height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  align-items: center;
  overflow: hidden;
}

.diff-toolbar__navigation button {
  min-width: 30px;
  padding: 0;
  border-left: 1px solid var(--color-border);
  border-radius: 0;
}

.diff-toolbar__counter {
  min-width: 66px;
  padding: 0 9px;
  color: var(--color-text-muted);
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}

.diff-toolbar .diff-toolbar__icon,
.diff-settings summary {
  width: 32px;
  padding: 0;
}

.diff-settings {
  position: relative;
}

.diff-settings summary {
  list-style: none;
}

.diff-settings summary::-webkit-details-marker {
  display: none;
}

.diff-settings__popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 9px);
  right: 0;
  display: grid;
  width: 230px;
  padding: 13px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-solid);
  box-shadow: 0 14px 38px rgb(15 23 42 / 16%);
  gap: 9px;
}

.diff-settings__popover strong {
  color: var(--color-text);
  font-size: 12px;
}

.diff-settings__popover label {
  display: flex;
  color: var(--color-text);
  font-size: 12px;
  gap: 8px;
}

.diff-settings__popover input {
  accent-color: var(--tools-accent);
}

.diff-settings__popover p {
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 10px;
  line-height: 1.5;
}

.diff-json-errors {
  display: grid;
  padding: 7px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-danger) 30%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 7%, var(--color-surface-solid));
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.diff-json-errors p {
  min-width: 0;
  margin: 0;
  color: var(--color-danger);
  font-size: 11px;
  line-height: 1.45;
}

.diff-workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.diff-editor-pane {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.diff-editor-labels {
  display: grid;
  min-height: 35px;
  border-bottom: 1px solid var(--color-border);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  background: color-mix(in srgb, var(--color-surface-solid) 96%, var(--color-surface-soft));
}

.diff-editor-labels > div {
  display: flex;
  min-width: 0;
  padding: 0 7px 0 12px;
  align-items: center;
  justify-content: space-between;
}

.diff-editor-labels > div + div {
  border-left: 1px solid var(--color-border);
}

.diff-editor-labels strong {
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 700;
}

.diff-editor-labels span {
  display: inline-flex;
  gap: 1px;
}

.diff-editor-labels button {
  display: grid;
  width: 27px;
  height: 27px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  place-items: center;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.diff-editor-labels button:hover,
.diff-editor-labels button:focus-visible {
  outline: 0;
  background: color-mix(in srgb, var(--tools-accent) 10%, transparent);
  color: var(--tools-accent);
}

.structure-panel {
  display: flex;
  width: clamp(420px, 40%, 520px);
  max-width: 48%;
  min-width: 0;
  border-left: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface-solid) 97%, var(--color-surface-soft));
  flex-direction: column;
}

.structure-panel > header {
  display: flex;
  min-height: 47px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  justify-content: space-between;
}

.structure-panel > header > div {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.structure-panel > header strong {
  color: var(--color-text);
  font-size: 12px;
}

.structure-panel > header span {
  color: var(--color-text-muted);
  font-size: 10px;
}

.structure-panel > header button {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  place-items: center;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.structure-panel > header button:hover {
  background: var(--color-surface-soft);
  color: var(--color-text);
}

.structure-panel__summary {
  display: flex;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  gap: 7px;
}

.structure-panel__summary span,
.structure-panel__kind {
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 700;
}

.is-added {
  background: color-mix(in srgb, #43a047 12%, transparent);
  color: #388e3c;
}

.is-removed {
  background: color-mix(in srgb, #e05252 12%, transparent);
  color: #c74444;
}

.is-modified {
  background: color-mix(in srgb, #e69b24 14%, transparent);
  color: #b57009;
}

.is-type-changed {
  background: color-mix(in srgb, #8b5cf6 13%, transparent);
  color: #7c4de0;
}

.structure-panel__list {
  min-height: 0;
  margin: 0;
  padding: 7px;
  overflow: auto;
  list-style: none;
}

.structure-panel__list button {
  display: grid;
  width: 100%;
  padding: 9px;
  border: 0;
  border-radius: 8px;
  align-items: center;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 8px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}

.structure-panel__list button:hover,
.structure-panel__list button:focus-visible {
  outline: 0;
  background: var(--color-surface-soft);
}

.structure-panel__list code {
  overflow: hidden;
  color: var(--color-text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.structure-panel__list small {
  overflow: hidden;
  color: var(--color-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 9px;
  grid-column: 2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.structure-panel__empty {
  display: grid;
  min-height: 180px;
  padding: 24px;
  place-content: center;
  place-items: center;
  color: var(--color-text-muted);
  text-align: center;
}

.structure-panel__empty p {
  margin: 8px 0 0;
  font-size: 11px;
}

@media (max-width: 920px) {
  .diff-tool {
    min-height: 680px;
  }

  .diff-toolbar {
    flex-wrap: wrap;
  }

  .diff-toolbar__spacer {
    min-width: 12px;
  }

  .diff-workspace.has-structure-panel {
    flex-direction: column;
  }

  .diff-workspace.has-structure-panel .diff-editor-pane {
    min-height: 380px;
  }

  .structure-panel {
    width: 100%;
    max-width: none;
    max-height: 42%;
    min-height: 230px;
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }
}

@media (max-width: 620px) {
  .diff-toolbar__granularity > span,
  .diff-toolbar__layout {
    display: none !important;
  }

  .diff-toolbar__navigation {
    order: 3;
  }

  .diff-toolbar__counter {
    min-width: 56px;
  }

  .diff-json-errors {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }

  .diff-editor-labels {
    min-height: 33px;
  }

  .diff-editor-labels > div {
    padding-left: 8px;
  }
}
</style>
