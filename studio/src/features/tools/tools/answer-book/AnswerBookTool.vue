<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconBook2, IconHistory, IconRefresh } from '@tabler/icons-vue';
import answerData from '@/assets/tools/answer-book.json';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';

type ThemeId = keyof typeof answerData;
interface Answer {
  id: string;
  theme: string;
  text: string;
  tone: string;
}
interface HistoryItem {
  id: string;
  question: string;
  answer: string;
  theme: ThemeId;
  mode: 'random' | 'daily';
  createdAt: string;
}
const themes: Array<{ id: ThemeId; name: string; subtitle: string }> = [
  { id: 'life', name: '人生', subtitle: '给愿意慢慢生活的人' },
  { id: 'love', name: '爱情', subtitle: '给认真感受的人' },
  { id: 'career', name: '职场', subtitle: '给正在前进的人' },
  { id: 'developer', name: '程序员', subtitle: '给解决问题的人' },
  { id: 'today', name: '今日指引', subtitle: '给今天的你' },
  { id: 'midnight', name: '深夜时刻', subtitle: '给还没入睡的人' },
];
const HISTORY_KEY = `${STORAGE_POLICY.preferences}:answer-book-history`;
const theme = ref<ThemeId>('life');
const mode = ref<'random' | 'daily'>('random');
const question = ref('');
const answer = ref<Answer | null>(null);
const turning = ref(false);
const showHistory = ref(false);
const history = ref<HistoryItem[]>([]);
const activeTheme = computed(() => themes.find((item) => item.id === theme.value)!);

if (storageAvailable()) {
  try {
    history.value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as HistoryItem[];
  } catch {
    history.value = [];
  }
}
function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
function random(max: number): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % max;
}
function reveal(): void {
  if (turning.value) return;
  const list = answerData[theme.value] as Answer[];
  const index =
    mode.value === 'daily'
      ? hash(`${new Date().toISOString().slice(0, 10)}:${theme.value}`) % list.length
      : random(list.length);
  turning.value = true;
  answer.value = null;
  window.setTimeout(() => {
    answer.value = list[index];
    turning.value = false;
    const record: HistoryItem = {
      id: crypto.randomUUID(),
      question: question.value.trim(),
      answer: list[index].text,
      theme: theme.value,
      mode: mode.value,
      createdAt: new Date().toISOString(),
    };
    history.value = [record, ...history.value].slice(0, 50);
    if (storageAvailable()) {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value));
      } catch {
        /* 本地存储不可用时仍保留当前内存记录。 */
      }
    }
  }, 520);
}
function reset(): void {
  answer.value = null;
  question.value = '';
}
function clearHistory(): void {
  history.value = [];
  if (storageAvailable()) localStorage.removeItem(HISTORY_KEY);
}
</script>

<template>
  <section class="answer-tool">
    <div class="answer-tool__controls">
      <div class="tool-segmented">
        <button type="button" :class="{ active: mode === 'random' }" @click="mode = 'random'">
          随心一问</button
        ><button type="button" :class="{ active: mode === 'daily' }" @click="mode = 'daily'">
          今日答案
        </button>
      </div>
      <div class="answer-tool__themes">
        <button
          v-for="item in themes"
          :key="item.id"
          type="button"
          :class="{ active: theme === item.id }"
          :aria-pressed="theme === item.id"
          @click="
            theme = item.id;
            answer = null;
          "
        >
          {{ item.name }}
        </button>
      </div>
      <label
        ><span>想问的问题</span
        ><textarea v-model="question" placeholder="也可以把问题留在心里…"></textarea>
      </label>
      <button
        type="button"
        class="tool-button tool-button--primary"
        :disabled="turning"
        @click="reveal"
      >
        <IconBook2 :size="16" aria-hidden="true" />{{
          turning ? '正在翻页…' : answer ? '再翻一页' : '翻开答案之书'
        }}
      </button>
      <div class="answer-tool__secondary">
        <button
          type="button"
          class="tool-button tool-button--quiet"
          @click="showHistory = !showHistory"
        >
          <IconHistory :size="15" aria-hidden="true" />本地历史（{{ history.length }}）</button
        ><button type="button" class="tool-button tool-button--quiet" @click="reset">
          <IconRefresh :size="15" aria-hidden="true" />重置
        </button>
      </div>
    </div>
    <div class="answer-tool__stage">
      <div
        class="answer-tool__book"
        :class="{ open: answer || turning, turning }"
        tabindex="0"
        role="button"
        aria-label="翻开答案之书"
        @click="reveal"
        @keydown.enter="reveal"
      >
        <div class="answer-tool__cover">
          <small>{{ activeTheme.subtitle }}</small
          ><strong>答案之书</strong><span>{{ activeTheme.name }}</span>
        </div>
        <div class="answer-tool__page">
          <p v-if="answer">{{ answer.text }}</p>
          <p v-else>{{ turning ? '书页正在展开…' : '在心里想好问题，然后翻开书页。' }}</p>
          <small v-if="answer">—— {{ activeTheme.name }}答案之书</small>
        </div>
      </div>
      <aside v-if="showHistory" class="answer-tool__history">
        <header>
          <h2>本地历史</h2>
          <button type="button" @click="clearHistory">清空</button>
        </header>
        <p v-if="!history.length">还没有翻阅记录。</p>
        <ol>
          <li v-for="item in history" :key="item.id">
            <span>{{ item.question || '藏在心里的问题' }}</span
            ><strong>“{{ item.answer }}”</strong
            ><small
              >{{ themes.find((t) => t.id === item.theme)?.name }} ·
              {{ item.mode === 'daily' ? '今日答案' : '随心一问' }}</small
            >
          </li>
        </ol>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.answer-tool {
  display: grid;
  overflow: hidden;
  min-height: 500px;
  grid-template-columns: 330px minmax(0, 1fr);
  border: 1px solid var(--color-border);
  border-radius: 13px;
  background: var(--color-surface);
}
.answer-tool__controls {
  display: flex;
  padding: 18px;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  gap: 16px;
}
.answer-tool__themes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.answer-tool__themes button {
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  background: var(--color-surface);
  font: inherit;
  font-size: 9px;
  cursor: pointer;
}
.answer-tool__themes button.active {
  border-color: var(--tools-accent);
  color: #fff;
  background: var(--tools-accent);
}
.answer-tool__controls label span {
  display: block;
  margin-bottom: 7px;
  font-size: 10px;
  font-weight: 700;
}
.answer-tool__controls textarea {
  width: 100%;
  min-height: 92px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-surface-muted);
  font: inherit;
  font-size: 10px;
  resize: vertical;
}
.answer-tool__secondary {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.answer-tool__stage {
  position: relative;
  display: grid;
  overflow: hidden;
  place-items: center;
  min-height: 500px;
  padding: 38px;
  background: radial-gradient(
    circle at 50% 28%,
    var(--color-surface),
    var(--color-surface-muted) 72%
  );
}
.answer-tool__book {
  position: relative;
  width: min(84%, 560px);
  height: 270px;
  perspective: 1600px;
  cursor: pointer;
}
.answer-tool__cover,
.answer-tool__page {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border-radius: 7px 15px 15px 7px;
  backface-visibility: hidden;
  transition:
    transform 0.85s cubic-bezier(0.2, 0.72, 0.21, 1),
    opacity 0.4s;
}
.answer-tool__cover {
  z-index: 2;
  color: #e7c96e;
  background: linear-gradient(115deg, #28482d, #4d7345 55%, #355737);
  box-shadow: 10px 16px 28px rgb(43 59 40/28%);
  transform-origin: left;
}
.answer-tool__cover small {
  letter-spacing: 2px;
}
.answer-tool__cover strong {
  margin: 18px 0;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 30px;
  letter-spacing: 8px;
}
.answer-tool__cover span {
  font-size: 10px;
  letter-spacing: 3px;
}
.answer-tool__page {
  padding: 32px;
  border: 1px solid #dfd5c2;
  color: #48533e;
  background: linear-gradient(90deg, #e7dfcf, #fffdf7 8%, #fffefb 93%, #e5ddcd);
  text-align: center;
}
.answer-tool__page p {
  font-family: 'Kaiti SC', STKaiti, serif;
  font-size: clamp(18px, 2.2vw, 27px);
  line-height: 1.6;
}
.answer-tool__page small {
  color: #8a8f7b;
}
.answer-tool__book.open .answer-tool__cover {
  opacity: 0.15;
  transform: rotateY(-155deg);
}
.answer-tool__book.turning .answer-tool__page {
  transform: rotateY(8deg);
}
.answer-tool__history {
  position: absolute;
  z-index: 4;
  inset: 18px;
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-surface) 96%, transparent);
  backdrop-filter: blur(9px);
}
.answer-tool__history header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.answer-tool__history h2 {
  font-size: 13px;
}
.answer-tool__history header button {
  border: 0;
  color: #e5484d;
  background: none;
  font-size: 9px;
  cursor: pointer;
}
.answer-tool__history ol {
  margin: 0;
  padding: 0;
  list-style: none;
}
.answer-tool__history li {
  display: grid;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
  gap: 4px;
  font-size: 9px;
}
.answer-tool__history li span,
.answer-tool__history li small {
  color: var(--color-text-muted);
}
@media (max-width: 850px) {
  .answer-tool {
    grid-template-columns: 1fr;
  }
  .answer-tool__controls {
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }
  .answer-tool__stage {
    min-height: 420px;
    padding: 24px;
  }
  .answer-tool__book {
    width: 92%;
    height: 230px;
  }
}
</style>
