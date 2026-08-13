<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconArrowsExchange, IconCheck, IconCopy, IconLanguage } from '@tabler/icons-vue';

type TranslationDirection = 'zh2en' | 'en2zh';

type GoogleTranslationResponse = [Array<[string | null, ...unknown[]] | null> | null, ...unknown[]];

interface FallbackTranslationResponse {
  data?: string;
}

const direction = ref<TranslationDirection>('zh2en');
const sourceText = ref('');
const targetText = ref('');
const processing = ref(false);
const error = ref('');
const copied = ref(false);
let requestController: AbortController | null = null;
let copiedTimer: number | null = null;

const sourceLanguage = computed(() => (direction.value === 'zh2en' ? '中文' : 'English'));
const targetLanguage = computed(() => (direction.value === 'zh2en' ? 'English' : '中文'));

async function requestPrimaryTranslation(
  text: string,
  from: string,
  to: string,
  signal: AbortSignal,
): Promise<string> {
  const endpoint = new URL('/translate_a/single', 'https://translate.googleapis.com');
  endpoint.searchParams.set('client', 'gtx');
  endpoint.searchParams.set('sl', from);
  endpoint.searchParams.set('tl', to);
  endpoint.searchParams.set('dt', 't');
  endpoint.searchParams.set('q', text);

  const response = await fetch(endpoint, {
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error(`翻译服务返回 HTTP ${response.status}。`);

  const payload = (await response.json()) as GoogleTranslationResponse;
  const result = payload[0]?.map((segment) => segment?.[0] ?? '').join('') ?? '';
  if (!result) throw new Error('翻译服务没有返回有效结果。');
  return result;
}

async function requestFallbackTranslation(
  text: string,
  from: string,
  to: string,
  signal: AbortSignal,
): Promise<string> {
  const endpoint = new URL('/api/translate', 'https://openapi.dwo.cc');
  endpoint.searchParams.set('text', text);
  endpoint.searchParams.set('source_lang', from === 'zh-CN' ? 'zh' : from);
  endpoint.searchParams.set('target_lang', to === 'zh-CN' ? 'zh' : to);
  endpoint.searchParams.set('ckey', 'O7E9KK24O2YA414FGRL7');

  const response = await fetch(endpoint, {
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error(`备用翻译服务返回 HTTP ${response.status}。`);

  const payload = (await response.json()) as FallbackTranslationResponse;
  const result = typeof payload.data === 'string' ? payload.data.trim() : '';
  if (!result) throw new Error('备用翻译服务没有返回有效结果。');
  return result;
}

async function requestTranslation(text: string, signal: AbortSignal): Promise<string> {
  const from = direction.value === 'zh2en' ? 'zh-CN' : 'en';
  const to = direction.value === 'zh2en' ? 'en' : 'zh-CN';

  try {
    return await requestPrimaryTranslation(text, from, to, signal);
  } catch (cause) {
    if (signal.aborted) throw cause;
    return requestFallbackTranslation(text, from, to, signal);
  }
}

async function translate(): Promise<void> {
  const text = sourceText.value.trim();
  if (!text || processing.value) return;

  requestController?.abort();
  requestController = new AbortController();
  const activeController = requestController;
  const timeout = window.setTimeout(() => activeController.abort('timeout'), 15_000);

  processing.value = true;
  error.value = '';
  try {
    targetText.value = await requestTranslation(text, activeController.signal);
  } catch (cause) {
    if (activeController.signal.aborted) error.value = '翻译超时，请稍后重试。';
    else
      error.value =
        cause instanceof Error ? `翻译失败：${cause.message}` : '翻译失败，请稍后重试。';
  } finally {
    window.clearTimeout(timeout);
    if (requestController === activeController) requestController = null;
    processing.value = false;
  }
}

function swapDirection(): void {
  direction.value = direction.value === 'zh2en' ? 'en2zh' : 'zh2en';
  if (targetText.value) {
    sourceText.value = targetText.value;
    targetText.value = '';
  }
  error.value = '';
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  void translate();
}

async function copyResult(): Promise<void> {
  if (!targetText.value) return;
  try {
    await navigator.clipboard.writeText(targetText.value);
    copied.value = true;
    error.value = '';
    if (copiedTimer !== null) window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copied.value = false;
      copiedTimer = null;
    }, 1500);
  } catch {
    error.value = '复制失败，请手动选择译文复制。';
  }
}

onBeforeUnmount(() => {
  requestController?.abort();
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
});
</script>

<template>
  <section class="tool-section" aria-label="翻译工作区">
    <div class="tool-section__body translation-tool">
      <div class="translation-tool__direction" aria-label="翻译方向">
        <strong>{{ sourceLanguage }}</strong>
        <button type="button" title="交换语言" aria-label="交换翻译语言" @click="swapDirection">
          <IconArrowsExchange :size="19" aria-hidden="true" />
        </button>
        <strong>{{ targetLanguage }}</strong>
      </div>

      <div class="translation-tool__columns">
        <div class="translation-tool__column">
          <span class="translation-tool__column-header">
            <label for="translation-source">原文</label>
            <small>{{ sourceText.length }} 字</small>
          </span>
          <textarea
            id="translation-source"
            v-model="sourceText"
            placeholder="请输入要翻译的文字…"
            :disabled="processing"
            @keydown="handleKeydown"
          ></textarea>
        </div>

        <div class="translation-tool__column">
          <span class="translation-tool__column-header">
            <label for="translation-target">译文</label>
          </span>
          <span class="translation-tool__output-wrap">
            <textarea
              id="translation-target"
              :value="targetText"
              class="translation-tool__output"
              placeholder="翻译结果将显示在这里…"
              readonly
            ></textarea>
            <button
              type="button"
              class="translation-tool__copy"
              :class="{ 'is-copied': copied }"
              :disabled="!targetText"
              :title="copied ? '已复制' : '复制译文'"
              :aria-label="copied ? '译文已复制' : '复制译文'"
              @click="copyResult"
            >
              <IconCheck v-if="copied" :size="16" aria-hidden="true" />
              <IconCopy v-else :size="16" aria-hidden="true" />
            </button>
          </span>
        </div>
      </div>

      <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>

      <button
        type="button"
        class="tool-button tool-button--primary translation-tool__submit"
        :disabled="!sourceText.trim() || processing"
        @click="translate"
      >
        <span v-if="processing" class="translation-tool__spinner" aria-hidden="true"></span>
        <IconLanguage v-else :size="16" aria-hidden="true" />
        {{ processing ? '翻译中…' : '翻译' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.translation-tool {
  display: grid;
  gap: 14px;
}

.translation-tool__direction {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.translation-tool__direction strong {
  min-width: 78px;
  color: var(--tools-accent);
  font-size: 13px;
  text-align: center;
}

.translation-tool__direction strong:last-child {
  color: #2563eb;
}

.translation-tool__direction button,
.translation-tool__copy {
  display: inline-flex;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-solid);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    color 150ms ease,
    transform 180ms ease;
}

.translation-tool__direction button:hover,
.translation-tool__direction button:focus-visible {
  border-color: var(--tools-accent);
  outline: none;
  color: var(--tools-accent);
  transform: rotate(180deg);
}

.translation-tool__columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 12px;
}

.translation-tool__column {
  display: grid;
  min-width: 0;
  grid-template-rows: auto minmax(220px, 1fr);
  gap: 7px;
}

.translation-tool__column-header {
  display: flex;
  min-height: 18px;
  align-items: center;
  justify-content: space-between;
}

.translation-tool__column-header label {
  color: var(--color-text);
  font-size: 11px;
  font-weight: 700;
}

.translation-tool__column-header small {
  color: var(--color-text-muted);
  font-size: 9px;
}

.translation-tool__column textarea {
  width: 100%;
  min-height: 220px;
  padding: 12px 42px 12px 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  outline: none;
  resize: none;
  background: var(--color-surface-solid);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  line-height: 1.7;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.translation-tool__column:first-child textarea {
  padding-right: 12px;
}

.translation-tool__column textarea:focus {
  border-color: color-mix(in srgb, var(--tools-accent) 52%, var(--color-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 9%, transparent);
}

.translation-tool__output-wrap {
  position: relative;
  display: flex;
  min-height: 0;
}

.translation-tool__output-wrap textarea {
  height: 100%;
}

.translation-tool__column textarea.translation-tool__output {
  background: color-mix(in srgb, var(--color-surface-soft) 72%, var(--color-surface-solid));
}

.translation-tool__copy {
  position: absolute;
  top: 9px;
  right: 9px;
  width: 30px;
  height: 30px;
}

.translation-tool__copy:hover:not(:disabled),
.translation-tool__copy:focus-visible:not(:disabled),
.translation-tool__copy.is-copied {
  border-color: var(--tools-accent);
  outline: none;
  background: var(--tools-accent);
  color: #fff;
}

.translation-tool__copy:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.translation-tool__submit {
  min-width: 120px;
  margin: 0 auto;
}

.translation-tool__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgb(255 255 255 / 42%);
  border-top-color: #fff;
  border-radius: 50%;
  animation: translation-spin 650ms linear infinite;
}

@keyframes translation-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .translation-tool__columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .translation-tool__column textarea {
    min-height: 145px;
  }

  .translation-tool__column {
    grid-template-rows: auto 145px;
  }

  .translation-tool__submit {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .translation-tool__direction button,
  .translation-tool__copy {
    transition: none;
  }

  .translation-tool__spinner {
    animation-duration: 1.5s;
  }
}
</style>
