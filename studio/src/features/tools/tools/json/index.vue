<script setup lang="ts">
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBraces,
  IconCheck,
  IconCopy,
  IconMessageOff,
  IconQuote,
} from '@tabler/icons-vue';
import { load as loadYaml } from 'js-yaml';
import { computed, onBeforeUnmount, ref } from 'vue';
import ToolCodeEditor from './ToolCodeEditor.vue';

interface JsonEditorHandle {
  foldAll(): Promise<void>;
  unfoldAll(): Promise<void>;
  focus(): void;
}

const editorRef = ref<JsonEditorHandle | null>(null);
const jsonInput = ref('');
const filterExpression = ref('');
const statusMessage = ref('');
const statusTone = ref<'success' | 'error'>('success');
const copiedAction = ref<'minify' | 'escape' | null>(null);
let statusTimer: number | undefined;

function showStatus(message: string, tone: 'success' | 'error' = 'success'): void {
  statusMessage.value = message;
  statusTone.value = tone;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(
    () => {
      statusMessage.value = '';
    },
    tone === 'error' ? 3600 : 1800,
  );
}

function describeJsonError(error: unknown): string {
  return error instanceof Error ? error.message : 'JSON 处理失败，请检查输入内容。';
}

const hasFilter = computed(() => Boolean(filterExpression.value.trim()));
const filterOutput = computed(() => {
  const expression = filterExpression.value.trim();
  if (!expression) return '';

  try {
    const suffix = expression.startsWith('this') ? expression.slice(4) : expression;
    if (!suffix || !/^[.[]/.test(suffix)) {
      throw new Error('过滤表达式应以 “.” 或 “[” 开头');
    }
    if (suffix.endsWith('.') || suffix.endsWith('[') || suffix.endsWith('(')) {
      throw new Error('Unexpected end of input');
    }

    // JS 过滤只在当前浏览器标签页执行，不读取或发送编辑器之外的数据。
    const evaluate = new Function(`"use strict"; return this${suffix};`) as (
      this: unknown,
    ) => unknown;
    const result = evaluate.call(parseJson());
    if (result === undefined) return '// undefined';
    return JSON.stringify(result, null, 2) ?? `// ${String(result)}`;
  } catch (error) {
    return `// ${describeJsonError(error)}`;
  }
});

function parseJson(input = jsonInput.value): unknown {
  if (!input.trim()) throw new Error('请输入 JSON 内容。');
  return JSON.parse(input) as unknown;
}

type JsonRecord = Record<string, unknown>;

function xmlElementToValue(element: Element): unknown {
  const result: JsonRecord = {};
  for (const attribute of Array.from(element.attributes)) {
    result[`@${attribute.name}`] = attribute.value;
  }

  const children = Array.from(element.children);
  const directText = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('')
    .trim();

  if (!children.length && !Object.keys(result).length) return directText;

  for (const child of children) {
    const value = xmlElementToValue(child);
    const current = result[child.tagName];
    result[child.tagName] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  if (directText) result['#text'] = directText;
  return result;
}

function xmlToJson(input: string): unknown {
  const documentNode = new DOMParser().parseFromString(input, 'application/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('XML 格式无效。');
  const root = documentNode.documentElement;
  return { [root.tagName]: xmlElementToValue(root) };
}

function looksLikeYaml(input: string): boolean {
  return (
    /^---(?:\s|$)/m.test(input) ||
    /^\s*-\s+\S/m.test(input) ||
    /^(?:\s*)(?:[^#\s][^:\n]*):(?:\s|$)/m.test(input)
  );
}

function convertPastedText(input: string): { content: string; format: 'XML' | 'YAML' } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    JSON.parse(trimmed);
    return null;
  } catch {
    // 合法 JSON 保留 Monaco 原生粘贴；仅继续识别 XML 或 YAML。
  }

  if (trimmed.startsWith('<')) {
    return { content: JSON.stringify(xmlToJson(trimmed), null, 2), format: 'XML' };
  }
  if (!looksLikeYaml(trimmed)) return null;

  const value = loadYaml(trimmed);
  if (value === undefined) return null;
  return { content: JSON.stringify(value, null, 2), format: 'YAML' };
}

function handleEditorPaste(text: string, event: ClipboardEvent): void {
  try {
    const converted = convertPastedText(text);
    if (!converted) return;
    event.preventDefault();
    jsonInput.value = converted.content;
    showStatus(`已将 ${converted.format} 转为 JSON`);
    editorRef.value?.focus();
  } catch (error) {
    showStatus(describeJsonError(error), 'error');
  }
}

function formatJson(): void {
  try {
    jsonInput.value = JSON.stringify(parseJson(), null, 2);
    showStatus('JSON 已格式化');
    editorRef.value?.focus();
  } catch (error) {
    showStatus(describeJsonError(error), 'error');
  }
}

function stripJsonComments(input: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
        result += character;
      }
      continue;
    }

    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      } else if (character === '\n') {
        result += character;
      }
      continue;
    }

    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      result += character;
    } else if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
    } else if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
    } else {
      result += character;
    }
  }

  if (blockComment) throw new Error('存在未闭合的块注释。');
  return result;
}

function removeComments(): void {
  try {
    const nextValue = stripJsonComments(jsonInput.value);
    if (nextValue === jsonInput.value) {
      showStatus('未发现可移除的注释');
      return;
    }
    jsonInput.value = nextValue;
    showStatus('注释已移除');
    editorRef.value?.focus();
  } catch (error) {
    showStatus(describeJsonError(error), 'error');
  }
}

async function copyJson(mode: 'minify' | 'escape'): Promise<void> {
  try {
    const minified = JSON.stringify(parseJson());
    const content = mode === 'escape' ? JSON.stringify(minified).slice(1, -1) : minified;
    await navigator.clipboard.writeText(content);
    copiedAction.value = mode;
    showStatus(mode === 'escape' ? '压缩转义结果已复制' : '压缩结果已复制');
    window.setTimeout(() => {
      if (copiedAction.value === mode) copiedAction.value = null;
    }, 1800);
  } catch (error) {
    showStatus(
      error instanceof SyntaxError ? describeJsonError(error) : '复制失败，请检查剪贴板权限。',
      'error',
    );
  }
}

async function foldAll(): Promise<void> {
  await editorRef.value?.foldAll();
  showStatus('已折叠全部');
}

async function unfoldAll(): Promise<void> {
  await editorRef.value?.unfoldAll();
  showStatus('已展开全部');
}

onBeforeUnmount(() => window.clearTimeout(statusTimer));
</script>

<template>
  <section class="json-editor" aria-label="JSON 编辑器">
    <div class="json-editor__panes" :class="{ 'json-editor__panes--split': hasFilter }">
      <ToolCodeEditor
        ref="editorRef"
        v-model="jsonInput"
        language="json"
        label="JSON 编辑器"
        :min-height="520"
        :word-wrap="false"
        placeholder="XML、YAML 粘贴自动转为 JSON"
        @paste-text="handleEditorPaste"
      />
      <ToolCodeEditor
        v-if="hasFilter"
        class="json-editor__result"
        :model-value="filterOutput"
        language="json"
        label="JS 过滤结果"
        :min-height="520"
        :word-wrap="false"
        :line-numbers="false"
        :folding="false"
        read-only
      />
    </div>

    <p
      v-if="statusMessage"
      class="json-editor__status"
      :class="`json-editor__status--${statusTone}`"
      :role="statusTone === 'error' ? 'alert' : 'status'"
    >
      {{ statusMessage }}
    </p>

    <footer class="json-editor__footer">
      <div class="json-editor__filter" aria-label="JS 过滤">
        <span aria-hidden="true">this</span>
        <input
          v-model="filterExpression"
          type="text"
          aria-label="JS 过滤表达式"
          placeholder='JS 过滤：示例 ".key.subkey"、"[0][1]"、".map(x=>x.val)"'
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="json-editor__actions" aria-label="JSON 操作">
        <button
          type="button"
          class="json-editor__action"
          data-tooltip="格式化"
          aria-label="格式化"
          @click="formatJson"
        >
          <IconBraces :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="json-editor__action"
          data-tooltip="折叠全部"
          aria-label="折叠全部"
          @click="foldAll"
        >
          <IconArrowsMinimize :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="json-editor__action"
          data-tooltip="展开全部"
          aria-label="展开全部"
          @click="unfoldAll"
        >
          <IconArrowsMaximize :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="json-editor__action"
          data-tooltip="去除注释"
          aria-label="去除注释"
          @click="removeComments"
        >
          <IconMessageOff :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="json-editor__action"
          data-tooltip="压缩并复制"
          aria-label="压缩并复制"
          @click="copyJson('minify')"
        >
          <IconCheck v-if="copiedAction === 'minify'" :size="18" aria-hidden="true" />
          <IconCopy v-else :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="json-editor__action"
          data-tooltip="压缩转义并复制"
          aria-label="压缩转义并复制"
          @click="copyJson('escape')"
        >
          <IconCheck v-if="copiedAction === 'escape'" :size="18" aria-hidden="true" />
          <IconQuote v-else :size="18" aria-hidden="true" />
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.json-editor {
  position: relative;
  display: flex;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 13px;
  background: var(--color-surface-solid);
  box-shadow: 0 4px 18px rgb(16 24 40 / 3%);
  flex-direction: column;
}

.json-editor__panes {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}

.json-editor__panes--split {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.json-editor__panes :deep(.tool-code-editor) {
  min-height: max(520px, calc(100dvh - var(--header-height) - 260px)) !important;
}

.json-editor__result {
  border-left: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, var(--color-surface-soft));
}

.json-editor__footer {
  position: relative;
  z-index: 2;
  display: flex;
  min-height: 42px;
  border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface-solid) 94%, var(--color-surface-soft));
  align-items: stretch;
  justify-content: space-between;
}

.json-editor__filter {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: stretch;
}

.json-editor__filter > span {
  display: inline-flex;
  padding: 0 10px;
  border-right: 1px solid var(--color-border);
  align-items: center;
  background: var(--color-surface-soft);
  color: var(--color-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.json-editor__filter input {
  width: 100%;
  min-width: 120px;
  padding: 0 12px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}

.json-editor__filter input::placeholder {
  color: var(--color-text-muted);
  opacity: 0.65;
}

.json-editor__actions {
  display: flex;
  flex: 0 0 auto;
  border-left: 1px solid var(--color-border);
  align-items: center;
  gap: 2px;
  padding: 0 6px;
}

.json-editor__action {
  position: relative;
  display: inline-grid;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  place-items: center;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 140ms ease,
    background 140ms ease;
}

.json-editor__action:hover,
.json-editor__action:focus-visible {
  color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 10%, transparent);
}

.json-editor__action:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tools-accent) 54%, transparent);
  outline-offset: 1px;
}

.json-editor__action::after {
  position: absolute;
  z-index: 20;
  right: 0;
  bottom: calc(100% + 8px);
  padding: 5px 7px;
  border-radius: 6px;
  background: rgb(28 30 34 / 94%);
  color: #fff;
  box-shadow: 0 4px 14px rgb(15 23 42 / 18%);
  content: attr(data-tooltip);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.2;
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px);
  transition:
    opacity 140ms ease,
    transform 140ms ease;
  white-space: nowrap;
}

.json-editor__action:hover::after,
.json-editor__action:focus-visible::after {
  opacity: 1;
  transform: translateY(0);
}

.json-editor__status {
  position: absolute;
  z-index: 4;
  right: 12px;
  bottom: 52px;
  max-width: min(460px, calc(100% - 24px));
  margin: 0;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, #4ea43c 26%, var(--color-border));
  border-radius: 7px;
  background: color-mix(in srgb, #4ea43c 9%, var(--color-surface-solid));
  color: #3d8431;
  box-shadow: 0 5px 18px rgb(15 23 42 / 10%);
  font-size: 11px;
}

.json-editor__status--error {
  border-color: color-mix(in srgb, var(--color-danger) 34%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 9%, var(--color-surface-solid));
  color: var(--color-danger);
}

@media (max-width: 760px) {
  .json-editor__panes,
  .json-editor__panes--split {
    grid-template-columns: minmax(0, 1fr);
  }

  .json-editor__panes :deep(.tool-code-editor) {
    min-height: max(440px, calc(100dvh - var(--header-height) - 300px)) !important;
  }

  .json-editor__result {
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }

  .json-editor__footer {
    min-height: 84px;
    flex-direction: column;
  }

  .json-editor__filter {
    min-height: 42px;
    border-bottom: 1px solid var(--color-border);
  }

  .json-editor__actions {
    min-height: 42px;
    border-left: 0;
    justify-content: flex-end;
  }

  .json-editor__status {
    bottom: 94px;
  }
}
</style>
