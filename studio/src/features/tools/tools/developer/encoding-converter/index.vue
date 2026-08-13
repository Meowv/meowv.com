<script setup lang="ts">
import {
  IconArrowsExchange,
  IconCheck,
  IconCopy,
  IconEraser,
  IconSparkles,
} from '@tabler/icons-vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

type EncodingMode = 'base64' | 'url' | 'unicode' | 'html' | 'hex';
type Direction = 'encode' | 'decode';
type HexFormat = 'spaced' | 'compact' | 'prefixed' | 'escaped';
type UrlScope = 'component' | 'full';

interface ModeOption {
  id: EncodingMode;
  label: string;
}

interface TransformResult {
  value: string;
  error: string;
}

const modes: ModeOption[] = [
  { id: 'base64', label: 'Base64' },
  { id: 'url', label: 'URL' },
  { id: 'unicode', label: 'Unicode' },
  { id: 'html', label: 'HTML Entity' },
  { id: 'hex', label: 'Hex' },
];

const mode = ref<EncodingMode>('base64');
const direction = ref<Direction>('encode');
const input = ref('你好，Studio 👋');
const base64UrlSafe = ref(false);
const urlScope = ref<UrlScope>('component');
const hexFormat = ref<HexFormat>('spaced');
const copied = ref(false);
const actionError = ref('');
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const currentMode = computed(() => modes.find((item) => item.id === mode.value)!);
const outputLabel = computed(
  () => `${currentMode.value.label} ${direction.value === 'encode' ? '编码' : '解码'}结果`,
);

function bytesToBinary(bytes: Uint8Array): string {
  const parts: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return parts.join('');
}

function encodeBase64(value: string): string {
  const encoded = btoa(bytesToBinary(new TextEncoder().encode(value)));
  return base64UrlSafe.value
    ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    : encoded;
}

function decodeBase64(value: string): string {
  let normalized = value.replace(/\s+/g, '');
  if (base64UrlSafe.value) normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
  if (!normalized) return '';
  if (
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) ||
    normalized.replace(/=+$/, '').length % 4 === 1
  ) {
    throw new Error('Base64 内容无效，请检查字符或填充。');
  }
  if (normalized.includes('=') && normalized.length % 4 !== 0) {
    throw new Error('Base64 内容无效，请检查字符或填充。');
  }
  if (!normalized.includes('=')) {
    normalized += '='.repeat((4 - (normalized.length % 4)) % 4);
  }
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function encodeUnicode(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const lowSurrogate = value.charCodeAt(index + 1);
      if (lowSurrogate < 0xdc00 || lowSurrogate > 0xdfff) {
        throw new Error('Unicode 文本包含未配对的代理项。');
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      const highSurrogate = value.charCodeAt(index - 1);
      if (highSurrogate < 0xd800 || highSurrogate > 0xdbff) {
        throw new Error('Unicode 文本包含未配对的代理项。');
      }
    }
    result += `\\u${codeUnit.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return result;
}

function decodeUnicode(value: string): string {
  let decoded = '';
  let offset = 0;

  while (offset < value.length) {
    if (value[offset] !== '\\' || (value[offset + 1] !== 'u' && value[offset + 1] !== 'U')) {
      decoded += value[offset];
      offset += 1;
      continue;
    }

    const remaining = value.slice(offset);
    const codePointMatch = remaining.match(/^\\u\{([0-9a-fA-F]{1,6})\}/);
    const longCodePointMatch = remaining.match(/^\\U([0-9a-fA-F]{8})/);
    const codeUnitMatch = remaining.match(/^\\u([0-9a-fA-F]{4})/);

    if (codePointMatch || longCodePointMatch) {
      const match = codePointMatch ?? longCodePointMatch!;
      const codePoint = Number.parseInt(match[1]!, 16);
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        throw new Error('Unicode 码点超出有效范围。');
      }
      decoded += String.fromCodePoint(codePoint);
      offset += match[0].length;
      continue;
    }

    if (!codeUnitMatch) throw new Error('Unicode 转义格式无效，应为 \\uXXXX。');
    const codeUnit = Number.parseInt(codeUnitMatch[1]!, 16);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const lowSurrogateMatch = remaining
        .slice(codeUnitMatch[0].length)
        .match(/^\\u([0-9a-fA-F]{4})/);
      const lowSurrogate = lowSurrogateMatch
        ? Number.parseInt(lowSurrogateMatch[1]!, 16)
        : Number.NaN;
      if (!lowSurrogateMatch || lowSurrogate < 0xdc00 || lowSurrogate > 0xdfff) {
        throw new Error('Unicode 码点超出有效范围。');
      }
      decoded += String.fromCodePoint(
        0x10000 + (codeUnit - 0xd800) * 0x400 + (lowSurrogate - 0xdc00),
      );
      offset += codeUnitMatch[0].length + lowSurrogateMatch[0].length;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error('Unicode 码点超出有效范围。');
    }
    decoded += String.fromCharCode(codeUnit);
    offset += codeUnitMatch[0].length;
  }

  return decoded;
}

const htmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function encodeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEntities[character]!);
}

function decodeHtml(value: string): string {
  return value.replace(
    /&(?:#(?:[xX]([0-9a-fA-F]+)|(\d+))|([A-Za-z][A-Za-z0-9]+));/g,
    (entity, hexadecimal: string | undefined, decimal: string | undefined) => {
      if (!hexadecimal && !decimal) {
        const decoder = document.createElement('textarea');
        decoder.innerHTML = entity;
        return decoder.value;
      }
      const codePoint = Number.parseInt(hexadecimal ?? decimal ?? '', hexadecimal ? 16 : 10);
      if (
        !Number.isFinite(codePoint) ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        throw new Error('HTML 数字实体超出有效 Unicode 范围。');
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function encodeHex(value: string): string {
  const bytes = [...new TextEncoder().encode(value)].map((byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  );
  if (hexFormat.value === 'compact') return bytes.join('');
  if (hexFormat.value === 'prefixed') return bytes.map((byte) => `0x${byte}`).join(' ');
  if (hexFormat.value === 'escaped') return bytes.map((byte) => `\\x${byte}`).join('');
  return bytes.join(' ');
}

function decodeHex(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  let normalized = '';
  if (/^(?:\\x[0-9a-fA-F]{2})+$/i.test(trimmed)) {
    normalized = trimmed.replace(/\\x/gi, '');
  } else if (/^0x[0-9a-fA-F]{2}(?:\s+0x[0-9a-fA-F]{2})*$/i.test(trimmed)) {
    normalized = trimmed.replace(/0x/gi, '').replace(/\s+/g, '');
  } else if (/^[0-9a-fA-F]{2}(?:\s+[0-9a-fA-F]{2})+$/.test(trimmed)) {
    normalized = trimmed.replace(/\s+/g, '');
  } else if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    normalized = trimmed;
  } else {
    throw new Error('Hex 内容包含无效字符。');
  }
  if (normalized.length % 2 !== 0) throw new Error('Hex 内容必须由完整的两位字节组成。');
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function transform(value: string): string {
  if (!value) return '';
  if (mode.value === 'base64') {
    return direction.value === 'encode' ? encodeBase64(value) : decodeBase64(value);
  }
  if (mode.value === 'url') {
    if (direction.value === 'encode') {
      return urlScope.value === 'component' ? encodeURIComponent(value) : encodeURI(value);
    }
    return urlScope.value === 'component' ? decodeURIComponent(value) : decodeURI(value);
  }
  if (mode.value === 'unicode') {
    return direction.value === 'encode' ? encodeUnicode(value) : decodeUnicode(value);
  }
  if (mode.value === 'html') {
    return direction.value === 'encode' ? encodeHtml(value) : decodeHtml(value);
  }
  return direction.value === 'encode' ? encodeHex(value) : decodeHex(value);
}

const transformation = computed<TransformResult>(() => {
  try {
    return { value: transform(input.value), error: '' };
  } catch (error) {
    const fallback = `${currentMode.value.label} ${direction.value === 'encode' ? '编码' : '解码'}失败。`;
    return { value: '', error: error instanceof Error ? error.message : fallback };
  }
});

function stats(value: string): string {
  return `${Array.from(value).length} 字符 · ${new TextEncoder().encode(value).length} Bytes`;
}

function swapDirection(): void {
  if (transformation.value.error) return;
  input.value = transformation.value.value;
  direction.value = direction.value === 'encode' ? 'decode' : 'encode';
}

function clearInput(): void {
  input.value = '';
  actionError.value = '';
}

function loadExample(): void {
  direction.value = 'encode';
  input.value = '你好，Studio 👋';
  actionError.value = '';
}

async function copyOutput(): Promise<void> {
  if (transformation.value.error || !transformation.value.value) return;
  try {
    await navigator.clipboard.writeText(transformation.value.value);
    copied.value = true;
    actionError.value = '';
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied.value = false;
    }, 1600);
  } catch {
    actionError.value = '复制失败，请检查浏览器剪贴板权限。';
  }
}

watch([mode, direction, input, base64UrlSafe, urlScope, hexFormat], () => {
  copied.value = false;
  actionError.value = '';
});

onBeforeUnmount(() => clearTimeout(copiedTimer));
</script>

<template>
  <section class="encoding-converter" aria-label="编码转换器">
    <header class="encoding-toolbar">
      <nav class="encoding-toolbar__modes" aria-label="编码类型">
        <button
          v-for="item in modes"
          :key="item.id"
          type="button"
          :class="{ 'is-active': mode === item.id }"
          :aria-pressed="mode === item.id"
          @click="mode = item.id"
        >
          {{ item.label }}
        </button>
      </nav>

      <div class="encoding-toolbar__spacer"></div>
      <div class="encoding-toolbar__directions" aria-label="转换方向">
        <button
          type="button"
          :class="{ 'is-active': direction === 'encode' }"
          :aria-pressed="direction === 'encode'"
          @click="direction = 'encode'"
        >
          编码
        </button>
        <button
          type="button"
          :class="{ 'is-active': direction === 'decode' }"
          :aria-pressed="direction === 'decode'"
          @click="direction = 'decode'"
        >
          解码
        </button>
      </div>
    </header>

    <div v-if="mode === 'base64' || mode === 'url' || mode === 'hex'" class="encoding-options">
      <label v-if="mode === 'base64'" class="encoding-options__check">
        <input v-model="base64UrlSafe" type="checkbox" />
        URL Safe
      </label>
      <label v-if="mode === 'url'">
        <span>编码范围</span>
        <select v-model="urlScope" aria-label="URL 编码范围">
          <option value="component">URL 组件</option>
          <option value="full">完整 URL</option>
        </select>
      </label>
      <label v-if="mode === 'hex'">
        <span>输出格式</span>
        <select v-model="hexFormat" aria-label="Hex 输出格式" :disabled="direction === 'decode'">
          <option value="spaced">48 65</option>
          <option value="compact">4865</option>
          <option value="prefixed">0x48 0x65</option>
          <option value="escaped">\x48\x65</option>
        </select>
      </label>
    </div>

    <div class="encoding-panels">
      <section class="encoding-panel">
        <header>
          <div>
            <strong>原始内容</strong>
            <span>输入后实时转换</span>
          </div>
          <div class="encoding-panel__actions">
            <button type="button" title="载入示例" aria-label="载入示例" @click="loadExample">
              <IconSparkles :size="17" aria-hidden="true" />
            </button>
            <button type="button" title="清空" aria-label="清空原始内容" @click="clearInput">
              <IconEraser :size="17" aria-hidden="true" />
            </button>
          </div>
        </header>
        <textarea
          v-model="input"
          aria-label="原始内容"
          :placeholder="
            direction === 'encode' ? '输入要编码的文本' : `输入要解码的 ${currentMode.label} 内容`
          "
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        ></textarea>
        <footer>{{ stats(input) }}</footer>
      </section>

      <button
        type="button"
        class="encoding-swap"
        :disabled="Boolean(transformation.error)"
        aria-label="将结果放入输入并反转方向"
        title="交换并反转方向"
        @click="swapDirection"
      >
        <IconArrowsExchange :size="19" aria-hidden="true" />
      </button>

      <section class="encoding-panel encoding-panel--result">
        <header>
          <div>
            <strong>转换结果</strong>
            <span>{{ outputLabel }}</span>
          </div>
          <div class="encoding-panel__actions">
            <button
              type="button"
              title="复制结果"
              aria-label="复制转换结果"
              :disabled="Boolean(transformation.error) || !transformation.value"
              @click="copyOutput"
            >
              <IconCheck v-if="copied" :size="17" aria-hidden="true" />
              <IconCopy v-else :size="17" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div v-if="transformation.error || actionError" class="encoding-panel__error" role="alert">
          <strong>无法转换</strong>
          <p>{{ transformation.error || actionError }}</p>
        </div>
        <textarea
          v-else
          :value="transformation.value"
          aria-label="转换结果"
          placeholder="转换结果会显示在这里"
          spellcheck="false"
          readonly
        ></textarea>
        <footer>{{ stats(transformation.value) }}</footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.encoding-converter {
  display: flex;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 13px;
  background: var(--color-surface-solid);
  box-shadow: 0 4px 18px rgb(16 24 40 / 3%);
  flex-direction: column;
}

.encoding-toolbar {
  display: flex;
  min-height: 51px;
  padding: 7px 9px;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  gap: 8px;
  background: color-mix(in srgb, var(--color-surface-solid) 94%, var(--color-surface-soft));
}

.encoding-toolbar__modes,
.encoding-toolbar__directions {
  display: flex;
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: var(--color-surface-soft);
  gap: 1px;
}

.encoding-toolbar button,
.encoding-panel__actions button {
  display: inline-grid;
  min-height: 31px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  place-items: center;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  transition:
    color 140ms ease,
    background 140ms ease;
}

.encoding-toolbar button:hover,
.encoding-toolbar button:focus-visible,
.encoding-toolbar button.is-active,
.encoding-panel__actions button:hover,
.encoding-panel__actions button:focus-visible {
  outline: 0;
  background: color-mix(in srgb, var(--tools-accent) 10%, transparent);
  color: var(--tools-accent);
}

.encoding-toolbar button.is-active {
  background: var(--color-surface-solid);
  box-shadow: 0 1px 5px rgb(15 23 42 / 8%);
}

.encoding-toolbar__spacer {
  flex: 1;
}

.encoding-options {
  display: flex;
  min-height: 42px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  gap: 14px;
  background: var(--color-surface-soft);
  color: var(--color-text-muted);
  font-size: 11px;
}

.encoding-options label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.encoding-options input {
  accent-color: var(--tools-accent);
}

.encoding-options select {
  height: 29px;
  padding: 0 25px 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  outline: 0;
  background: var(--color-surface-solid);
  color: var(--color-text);
  font: inherit;
}

.encoding-options select:focus {
  border-color: color-mix(in srgb, var(--tools-accent) 55%, var(--color-border));
}

.encoding-panels {
  position: relative;
  display: grid;
  min-height: max(570px, calc(100dvh - var(--header-height) - 290px));
  padding: 12px;
  grid-template-rows: repeat(2, minmax(240px, 1fr));
  gap: 12px;
}

.encoding-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-solid);
  flex-direction: column;
}

.encoding-panel > header {
  display: flex;
  min-height: 42px;
  padding: 0 7px 0 12px;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  justify-content: space-between;
  background: color-mix(in srgb, var(--color-surface-solid) 95%, var(--color-surface-soft));
}

.encoding-panel > header > div:first-child {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}

.encoding-panel > header strong {
  color: var(--color-text);
  font-size: 12px;
}

.encoding-panel > header span {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.encoding-panel__actions {
  display: flex;
  flex: 0 0 auto;
}

.encoding-panel__actions button {
  width: 31px;
  padding: 0;
}

.encoding-panel__actions button:disabled,
.encoding-toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.encoding-panel textarea {
  width: 100%;
  min-height: 0;
  padding: 13px 14px;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: var(--color-text);
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
  tab-size: 2;
}

.encoding-panel textarea::placeholder {
  color: var(--color-text-muted);
  opacity: 0.55;
}

.encoding-panel--result textarea {
  background: color-mix(in srgb, var(--color-surface-soft) 38%, transparent);
}

.encoding-panel > footer {
  min-height: 31px;
  padding: 0 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-soft);
  color: var(--color-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 9px;
  line-height: 31px;
  text-align: right;
}

.encoding-panel__error {
  display: grid;
  min-height: 0;
  padding: 24px;
  place-content: center;
  place-items: center;
  background: color-mix(in srgb, var(--color-danger) 5%, var(--color-surface-solid));
  color: var(--color-danger);
  flex: 1;
  text-align: center;
}

.encoding-panel__error strong {
  font-size: 13px;
}

.encoding-panel__error p {
  max-width: 520px;
  margin: 7px 0 0;
  font-size: 11px;
  line-height: 1.6;
}

.encoding-swap {
  position: absolute;
  z-index: 5;
  top: 50%;
  left: 50%;
  display: grid;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  place-items: center;
  background: var(--color-surface-solid);
  box-shadow: 0 5px 15px rgb(15 23 42 / 11%);
  color: var(--tools-accent);
  cursor: pointer;
  transform: translate(-50%, -50%) rotate(90deg);
}

.encoding-swap:hover,
.encoding-swap:focus-visible {
  outline: 0;
  border-color: color-mix(in srgb, var(--tools-accent) 52%, var(--color-border));
  background: color-mix(in srgb, var(--tools-accent) 8%, var(--color-surface-solid));
}

.encoding-swap:disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 800px) {
  .encoding-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .encoding-toolbar__modes {
    overflow-x: auto;
  }

  .encoding-toolbar__modes button {
    flex: 1 0 auto;
  }

  .encoding-toolbar__spacer {
    display: none;
  }

  .encoding-toolbar__directions button {
    flex: 1;
  }

  .encoding-options {
    flex-wrap: wrap;
  }
}

@media (max-width: 520px) {
  .encoding-panels {
    min-height: 620px;
    padding: 8px;
    gap: 9px;
  }

  .encoding-panel > header span {
    display: none;
  }

  .encoding-swap {
    width: 34px;
    height: 34px;
  }
}
</style>
