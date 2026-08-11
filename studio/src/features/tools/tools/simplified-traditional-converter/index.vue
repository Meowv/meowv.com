<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconArrowsExchange, IconCheck, IconCopy, IconX } from '@tabler/icons-vue';
import cnchar from 'cnchar';
import trad from 'cnchar-trad';

type ConversionDirection = 's2t' | 't2s';

cnchar.use(trad);

const direction = ref<ConversionDirection>('s2t');
const sourceText = ref('');
const copied = ref(false);
const copyError = ref('');
let copiedTimer: number | null = null;

const sourceMode = computed(() => (direction.value === 's2t' ? '简体' : '繁体'));
const targetMode = computed(() => (direction.value === 's2t' ? '繁体' : '简体'));
const targetText = computed(() =>
  direction.value === 's2t'
    ? cnchar.convert.simpleToTrad(sourceText.value)
    : cnchar.convert.tradToSimple(sourceText.value),
);

function swapDirection(): void {
  const converted = targetText.value;
  direction.value = direction.value === 's2t' ? 't2s' : 's2t';
  if (converted) sourceText.value = converted;
  copyError.value = '';
}

function clear(): void {
  sourceText.value = '';
  copied.value = false;
  copyError.value = '';
}

async function copyResult(): Promise<void> {
  if (!targetText.value) return;
  try {
    await navigator.clipboard.writeText(targetText.value);
    copied.value = true;
    copyError.value = '';
    if (copiedTimer !== null) window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copied.value = false;
      copiedTimer = null;
    }, 1500);
  } catch {
    copyError.value = '复制失败，请手动选择转换结果复制。';
  }
}

onBeforeUnmount(() => {
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
});
</script>

<template>
  <section class="tool-section" aria-label="繁简转换工作区">
    <div class="tool-section__body chinese-converter">
      <div class="chinese-converter__direction" aria-label="转换方向">
        <strong>{{ sourceMode }}</strong>
        <button type="button" title="交换模式" aria-label="交换转换模式" @click="swapDirection">
          <IconArrowsExchange :size="19" aria-hidden="true" />
        </button>
        <strong>{{ targetMode }}</strong>
      </div>

      <div class="chinese-converter__columns">
        <div class="chinese-converter__column">
          <div class="chinese-converter__column-header">
            <label for="converter-source">输入</label>
            <small>{{ sourceText.length }} 字</small>
          </div>
          <div class="chinese-converter__textarea-wrap">
            <textarea
              id="converter-source"
              v-model="sourceText"
              placeholder="请输入要转换的文字…"
            ></textarea>
            <button
              type="button"
              class="chinese-converter__corner-button"
              :disabled="!sourceText"
              title="清空输入"
              aria-label="清空输入"
              @click="clear"
            >
              <IconX :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div class="chinese-converter__column">
          <div class="chinese-converter__column-header">
            <label for="converter-target">结果</label>
          </div>
          <div class="chinese-converter__textarea-wrap">
            <textarea
              id="converter-target"
              :value="targetText"
              class="chinese-converter__output"
              placeholder="转换结果将实时显示在这里…"
              readonly
            ></textarea>
            <button
              type="button"
              class="chinese-converter__corner-button"
              :class="{ 'is-copied': copied }"
              :disabled="!targetText"
              :title="copied ? '已复制' : '复制结果'"
              :aria-label="copied ? '转换结果已复制' : '复制转换结果'"
              @click="copyResult"
            >
              <IconCheck v-if="copied" :size="16" aria-hidden="true" />
              <IconCopy v-else :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <p v-if="copyError" class="tool-status tool-status--error" role="alert">
        {{ copyError }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.chinese-converter {
  display: grid;
  gap: 14px;
}

.chinese-converter__direction {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.chinese-converter__direction strong {
  min-width: 78px;
  color: var(--tools-accent);
  font-size: 13px;
  text-align: center;
}

.chinese-converter__direction strong:last-child {
  color: #2563eb;
}

.chinese-converter__direction button,
.chinese-converter__corner-button {
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

.chinese-converter__direction button:hover,
.chinese-converter__direction button:focus-visible {
  border-color: var(--tools-accent);
  outline: none;
  color: var(--tools-accent);
  transform: rotate(180deg);
}

.chinese-converter__columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 12px;
}

.chinese-converter__column {
  display: grid;
  min-width: 0;
  grid-template-rows: auto minmax(230px, 1fr);
  gap: 7px;
}

.chinese-converter__column-header {
  display: flex;
  min-height: 18px;
  align-items: center;
  justify-content: space-between;
}

.chinese-converter__column-header label {
  color: var(--color-text);
  font-size: 11px;
  font-weight: 700;
}

.chinese-converter__column-header small {
  color: var(--color-text-muted);
  font-size: 9px;
}

.chinese-converter__textarea-wrap {
  position: relative;
  display: flex;
  min-height: 0;
}

.chinese-converter__textarea-wrap textarea {
  width: 100%;
  height: 100%;
  min-height: 230px;
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

.chinese-converter__textarea-wrap textarea:focus {
  border-color: color-mix(in srgb, var(--tools-accent) 52%, var(--color-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 9%, transparent);
}

.chinese-converter__textarea-wrap textarea.chinese-converter__output {
  background: color-mix(in srgb, var(--color-surface-soft) 72%, var(--color-surface-solid));
}

.chinese-converter__corner-button {
  position: absolute;
  top: 9px;
  right: 9px;
  width: 30px;
  height: 30px;
}

.chinese-converter__corner-button:hover:not(:disabled),
.chinese-converter__corner-button:focus-visible:not(:disabled),
.chinese-converter__corner-button.is-copied {
  border-color: var(--tools-accent);
  outline: none;
  background: var(--tools-accent);
  color: #fff;
}

.chinese-converter__corner-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 640px) {
  .chinese-converter__columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .chinese-converter__textarea-wrap textarea {
    min-height: 145px;
  }

  .chinese-converter__column {
    grid-template-rows: auto 145px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chinese-converter__direction button,
  .chinese-converter__corner-button {
    transition: none;
  }
}
</style>
