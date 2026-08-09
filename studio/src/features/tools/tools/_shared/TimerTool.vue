<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconPlayerPause, IconPlayerPlay, IconRefresh } from '@tabler/icons-vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';

type Mode = 'countdown' | 'stopwatch';
const mode = ref<Mode>('countdown');
const hours = ref(0);
const minutes = ref(5);
const seconds = ref(0);
const running = ref(false);
const elapsedMs = ref(0);
const remainingMs = ref(5 * 60_000);
const laps = ref<number[]>([]);
let startedAt = 0;
let initialValue = 0;
let frameId: number | null = null;

function format(value: number, centiseconds = false): string {
  const safe = Math.max(0, value);
  const totalSeconds = Math.floor(safe / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const base = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return centiseconds ? `${base}.${String(Math.floor((safe % 1000) / 10)).padStart(2, '0')}` : base;
}
const display = computed(() => format(mode.value === 'countdown' ? remainingMs.value : elapsedMs.value, mode.value === 'stopwatch'));

function configuredMs(): number { return Math.max(0, (hours.value * 3600 + minutes.value * 60 + seconds.value) * 1000); }
function tick(): void {
  if (!running.value) return;
  const delta = Date.now() - startedAt;
  if (mode.value === 'countdown') {
    remainingMs.value = Math.max(0, initialValue - delta);
    if (remainingMs.value <= 0) { running.value = false; frameId = null; return; }
  } else elapsedMs.value = initialValue + delta;
  frameId = requestAnimationFrame(tick);
}
function toggle(): void {
  if (running.value) { running.value = false; if (frameId !== null) cancelAnimationFrame(frameId); frameId = null; return; }
  if (mode.value === 'countdown' && remainingMs.value <= 0) remainingMs.value = configuredMs();
  if (mode.value === 'countdown' && remainingMs.value <= 0) return;
  initialValue = mode.value === 'countdown' ? remainingMs.value : elapsedMs.value;
  startedAt = Date.now();
  running.value = true;
  frameId = requestAnimationFrame(tick);
}
function reset(): void {
  running.value = false;
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  elapsedMs.value = 0;
  remainingMs.value = configuredMs();
  laps.value = [];
}
function switchMode(next: Mode): void { mode.value = next; reset(); }
function addLap(): void { if (mode.value === 'stopwatch' && elapsedMs.value > 0) laps.value = [elapsedMs.value, ...laps.value]; }
onBeforeUnmount(() => { if (frameId !== null) cancelAnimationFrame(frameId); });
</script>

<template>
  <section class="timer-tool">
    <div class="tool-segmented" role="tablist" aria-label="计时模式">
      <button type="button" :class="{ active: mode === 'countdown' }" @click="switchMode('countdown')">倒计时</button>
      <button type="button" :class="{ active: mode === 'stopwatch' }" @click="switchMode('stopwatch')">秒表</button>
    </div>
    <div class="timer-tool__display" aria-live="polite">{{ display }}</div>
    <div v-if="mode === 'countdown'" class="timer-tool__inputs">
      <label><input v-model.number="hours" type="number" min="0" max="99" @change="reset" /><span>时</span></label>
      <label><input v-model.number="minutes" type="number" min="0" max="59" @change="reset" /><span>分</span></label>
      <label><input v-model.number="seconds" type="number" min="0" max="59" @change="reset" /><span>秒</span></label>
    </div>
    <div class="timer-tool__actions">
      <button type="button" class="tool-button tool-button--primary" @click="toggle"><IconPlayerPause v-if="running" :size="16" aria-hidden="true" /><IconPlayerPlay v-else :size="16" aria-hidden="true" />{{ running ? '暂停' : '开始' }}</button>
      <button v-if="mode === 'stopwatch'" type="button" class="tool-button tool-button--secondary" :disabled="elapsedMs <= 0" @click="addLap">计次</button>
      <button type="button" class="tool-button tool-button--quiet" @click="reset"><IconRefresh :size="16" aria-hidden="true" />重置</button>
    </div>
    <ol v-if="laps.length" class="timer-tool__laps"><li v-for="(lap, index) in laps" :key="`${lap}-${index}`"><span>第 {{ laps.length - index }} 次</span><strong>{{ format(lap, true) }}</strong></li></ol>
  </section>
  <ToolHelp :steps="['选择倒计时或秒表。', '倒计时可设置时、分、秒；秒表可记录计次。', '暂停后可继续，重置会清空当前记录。']" note="计时依据绝对时间差计算，页面短暂休眠后会自动校正，不依赖固定间隔累加。" />
</template>

<style scoped>
.timer-tool { display: grid; min-height: 430px; padding: 34px; place-items: center; align-content: center; border: 1px solid var(--color-border); border-radius: 13px; background: var(--color-surface); gap: 22px; }.timer-tool__display { font-family: 'SFMono-Regular', Consolas, monospace; font-size: clamp(48px, 8vw, 92px); font-weight: 750; letter-spacing: -5px; font-variant-numeric: tabular-nums; }.timer-tool__inputs { display: flex; gap: 10px; }.timer-tool__inputs label { display: grid; grid-template-columns: 70px auto; align-items: center; gap: 6px; color: var(--color-text-muted); font-size: 10px; }.timer-tool__inputs input { height: 38px; padding: 0 8px; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text); background: var(--color-surface); text-align: center; }.timer-tool__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 9px; }.timer-tool__laps { width: min(100%, 420px); max-height: 160px; margin: 0; padding: 0; overflow: auto; list-style: none; }.timer-tool__laps li { display: flex; padding: 8px 2px; justify-content: space-between; border-bottom: 1px solid var(--color-border); font-size: 10px; }.timer-tool__laps span { color: var(--color-text-muted); }
</style>
