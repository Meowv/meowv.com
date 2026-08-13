<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { IconPlayerStop, IconVolume2 } from '@tabler/icons-vue';
import { pinyin } from 'pinyin-pro';
import ToolSection from '@/features/tools/components/ToolSection.vue';

interface PronunciationItem {
  character: string;
  pinyin: string;
  isChinese: boolean;
}

const quickPhrases = ['你好世界', '中文发音', '恭喜发财', '大展宏图'];
const inputText = ref('');
const displayText = ref('');
const speaking = ref(false);
const error = ref('');
const voiceInfo = ref('正在查找中文语音…');
let currentUtterance: SpeechSynthesisUtterance | null = null;
let preferredVoice: SpeechSynthesisVoice | null = null;

const pronunciationItems = computed<PronunciationItem[]>(() => {
  const characters = Array.from(displayText.value);
  const pronunciations = pinyin(displayText.value, {
    type: 'array',
    toneType: 'symbol',
    nonZh: 'removed',
  });
  let pronunciationIndex = 0;

  return characters.map((character) => {
    const isChinese = /\p{Script=Han}/u.test(character);
    return {
      character,
      isChinese,
      pinyin: isChinese ? (pronunciations[pronunciationIndex++] ?? '') : '',
    };
  });
});

function findChineseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => /^(zh|cmn)/i.test(voice.lang) && voice.localService) ??
    voices.find((voice) => /^(zh|cmn)/i.test(voice.lang)) ??
    null
  );
}

function updateVoice(): void {
  preferredVoice = findChineseVoice();
  voiceInfo.value = preferredVoice
    ? `语音：${preferredVoice.name || '中文'}`
    : '未找到中文语音，将使用浏览器默认语音';
}

function extractSpeechText(text: string): string {
  return text.replace(/[^a-zA-Z0-9\p{Script=Han}\s.,!?;:，。！？；：·～~@#%&*()（）+\-=/]/gu, '');
}

function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  currentUtterance = null;
  speaking.value = false;
}

function speak(text: string): void {
  if (!('speechSynthesis' in window)) {
    error.value = '当前浏览器不支持语音合成。';
    return;
  }

  const speechText = extractSpeechText(text).trim();
  if (!speechText) {
    error.value = '请输入有效内容。';
    return;
  }

  stopSpeaking();
  error.value = '';

  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.lang = 'zh-CN';
  utterance.rate = 1;
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.onstart = () => {
    if (currentUtterance === utterance) speaking.value = true;
  };
  utterance.onend = () => {
    if (currentUtterance !== utterance) return;
    currentUtterance = null;
    speaking.value = false;
  };
  utterance.onerror = (event) => {
    if (currentUtterance !== utterance) return;
    currentUtterance = null;
    speaking.value = false;
    if (event.error !== 'canceled' && event.error !== 'interrupted') {
      error.value = '浏览器语音播放失败。';
    }
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function handleSpeak(): void {
  if (currentUtterance) {
    stopSpeaking();
    return;
  }

  const text = inputText.value.trim();
  if (!text) {
    error.value = '请输入内容。';
    return;
  }

  displayText.value = text;
  speak(text);
}

function useQuickPhrase(phrase: string): void {
  inputText.value = phrase;
  displayText.value = phrase;
  speak(phrase);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  handleSpeak();
}

onMounted(() => {
  if (!('speechSynthesis' in window)) {
    voiceInfo.value = '当前浏览器不支持语音合成';
    return;
  }
  updateVoice();
  window.speechSynthesis.addEventListener('voiceschanged', updateVoice);
});

onBeforeUnmount(() => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.removeEventListener('voiceschanged', updateVoice);
  }
  stopSpeaking();
});
</script>

<template>
  <div class="pronunciation-tool">
    <ToolSection title="汉字标准发音" description="查询逐字拼音，并使用浏览器中文语音朗读。">
      <div class="pronunciation-tool__input-row">
        <label class="pronunciation-tool__input">
          <span class="sr-only">需要发音的内容</span>
          <input
            v-model="inputText"
            type="text"
            maxlength="200"
            placeholder="请输入中文、英文或数字"
            @keydown="handleKeydown"
          />
        </label>
        <button
          type="button"
          class="tool-button tool-button--primary pronunciation-tool__speak"
          @click="handleSpeak"
        >
          <IconPlayerStop v-if="speaking" :size="16" aria-hidden="true" />
          <IconVolume2 v-else :size="16" aria-hidden="true" />
          {{ speaking ? '停止' : '发音' }}
        </button>
      </div>

      <div class="pronunciation-tool__quick-list">
        <span>试试：</span>
        <button
          v-for="phrase in quickPhrases"
          :key="phrase"
          type="button"
          @click="useQuickPhrase(phrase)"
        >
          {{ phrase }}
        </button>
      </div>

      <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
    </ToolSection>

    <ToolSection
      v-if="displayText"
      id="pronunciation-result"
      title="拼音与发音"
      description="点击单个汉字可单独朗读。"
      tone="output"
    >
      <div class="pronunciation-tool__result">
        <template v-for="(item, index) in pronunciationItems" :key="`${item.character}-${index}`">
          <button
            v-if="item.isChinese"
            type="button"
            class="pronunciation-tool__item"
            :title="`点击朗读「${item.character}」`"
            :aria-label="`${item.character}，拼音 ${item.pinyin}，点击朗读`"
            @click="speak(item.character)"
          >
            <strong>{{ item.character }}</strong>
            <span>{{ item.pinyin }}</span>
            <small>点击朗读</small>
          </button>
          <div v-else class="pronunciation-tool__item pronunciation-tool__item--plain">
            <strong>{{ item.character }}</strong>
          </div>
        </template>
      </div>

      <div class="pronunciation-tool__status">
        <span v-if="speaking" class="pronunciation-tool__indicator" role="status">
          <i></i><i></i><i></i>朗读中…
        </span>
        <span v-else></span>
        <small>{{ voiceInfo }}</small>
      </div>
    </ToolSection>
  </div>
</template>

<style scoped>
.pronunciation-tool {
  display: grid;
  gap: 14px;
}

.pronunciation-tool__input-row {
  display: flex;
  gap: 10px;
}

.pronunciation-tool__input {
  flex: 1;
}

.pronunciation-tool__input input {
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  outline: none;
  background: var(--color-surface-solid);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.pronunciation-tool__input input:focus {
  border-color: color-mix(in srgb, var(--tools-accent) 52%, var(--color-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 9%, transparent);
}

.pronunciation-tool__speak {
  min-width: 98px;
}

.pronunciation-tool__quick-list {
  display: flex;
  margin-top: 12px;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.pronunciation-tool__quick-list > span {
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 650;
}

.pronunciation-tool__quick-list button {
  min-height: 29px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface-soft);
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    color 150ms ease;
}

.pronunciation-tool__quick-list button:hover,
.pronunciation-tool__quick-list button:focus-visible {
  border-color: var(--tools-accent);
  outline: none;
  background: var(--tools-accent);
  color: #fff;
}

.pronunciation-tool__result {
  display: flex;
  min-height: 96px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--tools-accent) 20%, var(--color-border));
  border-radius: 11px;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px 14px;
  background: color-mix(in srgb, var(--tools-accent) 6%, var(--color-surface-solid));
}

.pronunciation-tool__item {
  display: flex;
  min-width: 58px;
  min-height: 76px;
  padding: 7px 9px;
  border: 0;
  border-radius: 9px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  transition: background-color 150ms ease;
}

.pronunciation-tool__item:hover,
.pronunciation-tool__item:focus-visible {
  outline: none;
  background: color-mix(in srgb, var(--tools-accent) 11%, transparent);
}

.pronunciation-tool__item strong {
  font-size: 23px;
  line-height: 1.15;
  white-space: pre;
}

.pronunciation-tool__item span {
  color: var(--tools-accent);
  font-size: 11px;
  font-weight: 700;
}

.pronunciation-tool__item small {
  color: var(--color-text-muted);
  font-size: 8px;
}

.pronunciation-tool__item--plain {
  min-width: auto;
  cursor: default;
}

.pronunciation-tool__item--plain strong {
  color: var(--color-text-muted);
  font-size: 17px;
  font-weight: 500;
}

.pronunciation-tool__status {
  display: flex;
  min-height: 28px;
  padding-top: 9px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.pronunciation-tool__status small {
  color: var(--color-text-muted);
  font-size: 9px;
}

.pronunciation-tool__indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--tools-accent);
  font-size: 10px;
  font-weight: 700;
}

.pronunciation-tool__indicator i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  animation: pronunciation-pulse 800ms ease-in-out infinite;
  background: var(--tools-accent);
}

.pronunciation-tool__indicator i:nth-child(2) {
  animation-delay: 160ms;
}

.pronunciation-tool__indicator i:nth-child(3) {
  animation-delay: 320ms;
}

@keyframes pronunciation-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.8);
  }

  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}

@media (max-width: 600px) {
  .pronunciation-tool__input-row {
    flex-direction: column;
  }

  .pronunciation-tool__speak {
    width: 100%;
  }

  .pronunciation-tool__result {
    padding: 10px;
    gap: 7px;
  }

  .pronunciation-tool__item {
    min-width: 52px;
    min-height: 68px;
    padding: 6px;
  }

  .pronunciation-tool__item strong {
    font-size: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pronunciation-tool__quick-list button,
  .pronunciation-tool__item {
    transition: none;
  }

  .pronunciation-tool__indicator i {
    animation: none;
  }
}
</style>
