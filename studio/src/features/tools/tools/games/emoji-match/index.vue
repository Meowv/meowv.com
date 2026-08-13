<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconBulb, IconRefresh, IconTrophy } from '@tabler/icons-vue';

const EMOJIS = Array.from('😄🤣🙂🙃😉😇😍🤥😘😚😛😜😋🤗🤔🤐😶🤑😏🙄😳😬😴🤕🤠🤧😢😵😎🤓😡🤢😭😫😠');
const INITIAL_TIME = 60_000;
const MATCH_BONUS = 5_000;
const HINT_DELAY = 5_000;
const APPEAR_ORDER = [5, 6, 9, 10, 4, 7, 8, 11, 1, 2, 13, 14, 0, 3, 12, 15];

interface Tile {
  id: string;
  emoji: string;
  delay: number;
}

const board = ref<Tile[]>([]);
const selectedId = ref<string | null>(null);
const hint = ref('');
const hintShown = ref(false);
const boardAge = ref(0);
const score = ref(0);
const timeLeft = ref(INITIAL_TIME);
const started = ref(false);
const ended = ref(false);
const locked = ref(false);
const notice = ref('选择任意表情开始计时。');
const status = ref('等待开始');
const bonusVisible = ref(false);
const matchedIds = ref<string[]>([]);
let frameId: number | null = null;
let boardTimer: number | null = null;
let bonusTimer: number | null = null;
let lastFrame = 0;

const formattedTime = computed(() => {
  const safeValue = Math.max(0, timeLeft.value);
  const seconds = Math.floor(safeValue / 1000);
  const centiseconds = Math.floor((safeValue % 1000) / 10);
  return `${String(seconds).padStart(2, '0')}:${String(centiseconds).padStart(2, '0')}`;
});

const hintLabel = computed(() => {
  if (!started.value || ended.value) return '提示（5）';
  if (locked.value) return '正在刷新';
  if (hintShown.value) return `已提示：${hint.value}`;
  if (boardAge.value < HINT_DELAY)
    return `提示（${Math.ceil((HINT_DELAY - boardAge.value) / 1000)}）`;
  return '查看提示';
});

const hintDisabled = computed(
  () => !started.value || ended.value || locked.value || boardAge.value < HINT_DELAY,
);

function random(max: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = random(index + 1);
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}

function renderBoard(): void {
  const chosen = shuffle([...EMOJIS]).slice(0, 15);
  hint.value = chosen[14];
  const delays: number[] = [];
  APPEAR_ORDER.forEach((index, order) => {
    delays[index] = order * 18;
  });
  board.value = shuffle([...chosen, hint.value]).map((emoji, index) => ({
    id: crypto.randomUUID(),
    emoji,
    delay: delays[index],
  }));
  selectedId.value = null;
  matchedIds.value = [];
  boardAge.value = 0;
  hintShown.value = false;
  locked.value = false;
  status.value = started.value ? '寻找配对' : '等待开始';
}

function tick(timestamp: number): void {
  if (!started.value || ended.value) return;
  if (lastFrame) {
    const elapsed = timestamp - lastFrame;
    timeLeft.value -= elapsed;
    boardAge.value += elapsed;
  }
  lastFrame = timestamp;
  if (timeLeft.value <= 0) {
    endGame();
    return;
  }
  frameId = requestAnimationFrame(tick);
}

function startTimer(): void {
  if (started.value || ended.value) return;
  started.value = true;
  lastFrame = 0;
  status.value = '进行中';
  notice.value = '计时已开始，找出唯一相同的一对表情。';
  frameId = requestAnimationFrame(tick);
}

function showBonus(): void {
  if (bonusTimer !== null) window.clearTimeout(bonusTimer);
  bonusVisible.value = false;
  requestAnimationFrame(() => {
    bonusVisible.value = true;
    bonusTimer = window.setTimeout(() => {
      bonusVisible.value = false;
    }, 800);
  });
}

function choose(tile: Tile): void {
  if (ended.value || locked.value || selectedId.value === tile.id) return;
  startTimer();
  if (selectedId.value) {
    const previous = board.value.find((item) => item.id === selectedId.value);
    if (previous?.emoji === tile.emoji) {
      score.value += 1;
      timeLeft.value += MATCH_BONUS;
      matchedIds.value = [previous.id, tile.id];
      selectedId.value = null;
      locked.value = true;
      status.value = '配对成功';
      notice.value = '配对成功，奖励 5 秒！';
      showBonus();
      boardTimer = window.setTimeout(() => {
        if (!ended.value) renderBoard();
      }, 600);
      return;
    }
  }
  selectedId.value = tile.id;
  status.value = '已选择 1 个';
}

function showHint(): void {
  if (hintDisabled.value) return;
  hintShown.value = true;
  notice.value = `本轮重复的表情是 ${hint.value}。`;
}

function endGame(): void {
  timeLeft.value = 0;
  started.value = false;
  ended.value = true;
  locked.value = true;
  selectedId.value = null;
  status.value = '时间到';
  notice.value = '本局结束，点击“再玩一次”重新挑战。';
  if (boardTimer !== null) window.clearTimeout(boardTimer);
  if (frameId !== null) cancelAnimationFrame(frameId);
  boardTimer = null;
  frameId = null;
}

function resetGame(): void {
  if (frameId !== null) cancelAnimationFrame(frameId);
  if (boardTimer !== null) window.clearTimeout(boardTimer);
  if (bonusTimer !== null) window.clearTimeout(bonusTimer);
  frameId = null;
  boardTimer = null;
  bonusTimer = null;
  lastFrame = 0;
  timeLeft.value = INITIAL_TIME;
  score.value = 0;
  started.value = false;
  ended.value = false;
  locked.value = false;
  bonusVisible.value = false;
  notice.value = '选择任意表情开始计时。';
  renderBoard();
}

onBeforeUnmount(() => {
  if (frameId !== null) cancelAnimationFrame(frameId);
  if (boardTimer !== null) window.clearTimeout(boardTimer);
  if (bonusTimer !== null) window.clearTimeout(bonusTimer);
});

resetGame();
</script>

<template>
  <section class="emoji-match" aria-label="Emoji Match 游戏">
    <p class="emoji-match__rule">
      每轮 16 个表情中只有一对相同。首次选择即开始 60 秒倒计时，配对成功奖励 5 秒并刷新棋盘。
    </p>

    <div class="emoji-match__stats" aria-label="游戏状态">
      <div class="emoji-match__stat">
        <span>剩余时间</span>
        <strong :class="{ 'is-low': started && timeLeft <= 10_000 }">{{ formattedTime }}</strong>
        <em v-if="bonusVisible" aria-hidden="true">+5 秒</em>
      </div>
      <div class="emoji-match__stat">
        <span>已找到</span><strong>{{ score }} 对</strong>
      </div>
      <div class="emoji-match__stat">
        <span>当前状态</span><strong>{{ status }}</strong>
      </div>
    </div>

    <div class="emoji-match__game">
      <div class="emoji-match__grid" aria-label="表情符号棋盘">
        <button
          v-for="(tile, index) in board"
          :key="tile.id"
          type="button"
          class="emoji-match__tile"
          :class="{
            'is-selected': selectedId === tile.id,
            'is-matched': matchedIds.includes(tile.id),
          }"
          :style="{ '--emoji-delay': `${tile.delay}ms` }"
          :aria-label="`第 ${index + 1} 格，${tile.emoji}`"
          :aria-pressed="selectedId === tile.id"
          :disabled="locked || ended"
          @click="choose(tile)"
        >
          {{ tile.emoji }}
        </button>
      </div>

      <div v-if="ended" class="emoji-match__overlay">
        <div role="status">
          <IconTrophy :size="34" aria-hidden="true" />
          <h2>时间到</h2>
          <p>
            本次共找到 <strong>{{ score }} 对</strong>相同表情。
          </p>
          <button type="button" class="tool-button tool-button--primary" @click="resetGame">
            再玩一次
          </button>
        </div>
      </div>
    </div>

    <div class="emoji-match__controls">
      <button
        type="button"
        class="tool-button tool-button--primary"
        :disabled="hintDisabled"
        @click="showHint"
      >
        <IconBulb :size="16" aria-hidden="true" />{{ hintLabel }}
      </button>
      <button type="button" class="tool-button tool-button--secondary" @click="resetGame">
        <IconRefresh :size="16" aria-hidden="true" />重新开始
      </button>
    </div>
    <p class="emoji-match__notice" aria-live="polite">{{ notice }}</p>
  </section>
</template>

<style scoped>
.emoji-match {
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 13px;
  background: var(--color-surface);
}
.emoji-match__rule {
  margin: 0 0 14px;
  padding: 10px 13px;
  border: 1px solid color-mix(in srgb, var(--tools-accent) 20%, var(--color-border));
  border-radius: 8px;
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--tools-accent) 5%, var(--color-surface));
  font-size: 11px;
  line-height: 1.55;
}
.emoji-match__stats {
  display: grid;
  margin-bottom: 13px;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
}
.emoji-match__stat {
  position: relative;
  padding: 10px 7px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  text-align: center;
}
.emoji-match__stat span {
  display: block;
  margin-bottom: 3px;
  color: var(--color-text-muted);
  font-size: 10px;
}
.emoji-match__stat strong {
  display: block;
  color: var(--color-text);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.emoji-match__stat strong.is-low {
  color: #d1493f;
}
.emoji-match__stat em {
  position: absolute;
  top: 50%;
  left: calc(50% + 38px);
  color: var(--tools-accent);
  font-size: 10px;
  font-style: normal;
  font-weight: 750;
  animation: bonus 0.75s ease both;
}
.emoji-match__game {
  position: relative;
  overflow: hidden;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  background: var(--color-surface-muted);
}
.emoji-match__grid {
  display: grid;
  width: min(100%, 490px);
  margin: 0 auto;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
}
.emoji-match__tile {
  display: grid;
  aspect-ratio: 1;
  place-items: center;
  padding: 0;
  border: 2px solid var(--color-border);
  border-radius: 13px;
  color: inherit;
  background: var(--color-surface);
  box-shadow: 0 2px 7px rgb(31 35 48 / 5%);
  font: inherit;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
  font-size: clamp(26px, 4vw, 42px);
  cursor: pointer;
  animation: appear 0.28s cubic-bezier(0.18, 0.8, 0.3, 1.25) both;
  animation-delay: var(--emoji-delay);
  transition:
    border-color 0.16s,
    background 0.16s,
    transform 0.1s;
}
.emoji-match__tile:hover {
  border-color: color-mix(in srgb, var(--tools-accent) 45%, var(--color-border));
}
.emoji-match__tile:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--tools-accent) 24%, transparent);
  outline-offset: 2px;
}
.emoji-match__tile.is-selected {
  border-color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 8%, var(--color-surface));
}
.emoji-match__tile.is-matched {
  border-color: #48a825;
  background: color-mix(in srgb, #48a825 10%, var(--color-surface));
  animation: found 0.42s ease both;
}
.emoji-match__tile:disabled {
  opacity: 1;
  cursor: default;
}
.emoji-match__controls {
  display: flex;
  margin-top: 14px;
  justify-content: center;
  flex-wrap: wrap;
  gap: 9px;
}
.emoji-match__notice {
  min-height: 18px;
  margin: 9px 0 0;
  color: var(--color-text-muted);
  font-size: 10px;
  text-align: center;
}
.emoji-match__overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  backdrop-filter: blur(3px);
}
.emoji-match__overlay > div {
  text-align: center;
}
.emoji-match__overlay svg,
.emoji-match__overlay strong {
  color: var(--tools-accent);
}
.emoji-match__overlay h2 {
  margin: 7px 0;
}
.emoji-match__overlay p {
  margin: 0 0 15px;
  color: var(--color-text-muted);
  font-size: 11px;
}
@keyframes appear {
  from {
    opacity: 0;
    transform: scale(0.72);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes found {
  50% {
    transform: scale(0.82) rotate(5deg);
  }
}
@keyframes bonus {
  25%,
  70% {
    opacity: 1;
    transform: translateY(-3px);
  }
  100% {
    opacity: 0;
    transform: translateY(-14px);
  }
}
@media (max-width: 560px) {
  .emoji-match {
    padding: 12px;
  }
  .emoji-match__game {
    padding: 11px;
  }
  .emoji-match__grid {
    gap: 6px;
  }
  .emoji-match__tile {
    border-radius: 9px;
    font-size: clamp(23px, 9vw, 34px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .emoji-match__tile,
  .emoji-match__stat em {
    animation-duration: 0.01ms;
    animation-delay: 0ms;
    transition-duration: 0.01ms;
  }
}
</style>
