<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
interface Enemy {
  id: string;
  word: string;
  x: number;
  y: number;
}
const words = [
  'vue',
  'local',
  'studio',
  'browser',
  'canvas',
  'secure',
  'markdown',
  'image',
  'worker',
  'design',
  'router',
  'typescript',
];
const enemies = ref<Enemy[]>([]);
const input = ref('');
const score = ref(0);
const missed = ref(0);
const running = ref(false);
let spawnTimer = 0;
let animation = 0;
let last = 0;
const current = computed(() => enemies.value[0]?.word ?? '');
function random(max: number): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] % max;
}
function spawn(): void {
  enemies.value = [
    ...enemies.value,
    { id: crypto.randomUUID(), word: words[random(words.length)], x: 6 + random(78), y: 0 },
  ];
}
function frame(time: number): void {
  const delta = Math.min(0.05, (time - last) / 1000 || 0);
  last = time;
  if (running.value) {
    const next: Enemy[] = [];
    for (const enemy of enemies.value) {
      const moved = { ...enemy, y: enemy.y + delta * 13 };
      if (moved.y > 91) missed.value += 1;
      else next.push(moved);
    }
    enemies.value = next;
  }
  animation = requestAnimationFrame(frame);
}
function start(): void {
  score.value = 0;
  missed.value = 0;
  enemies.value = [];
  input.value = '';
  running.value = true;
  spawn();
  clearInterval(spawnTimer);
  spawnTimer = window.setInterval(spawn, 1250);
}
function stop(): void {
  running.value = false;
  clearInterval(spawnTimer);
}
watch(input, (value) => {
  if (!running.value || !current.value) return;
  if (value.trim().toLowerCase() === current.value.toLowerCase()) {
    enemies.value = enemies.value.slice(1);
    score.value += 1;
    input.value = '';
  }
});
animation = requestAnimationFrame(frame);
onBeforeUnmount(() => {
  stop();
  cancelAnimationFrame(animation);
});
</script>
<template>
  <ToolSection title="打字练习" description="输入最下方敌机单词，在它抵达底线前将其消灭。"
    ><div class="tool-stack">
      <div class="tool-typing-stage">
        <span
          v-for="enemy in enemies"
          :key="enemy.id"
          class="tool-typing-enemy"
          :style="{ left: `${enemy.x}%`, top: `${enemy.y}%` }"
          >✈ {{ enemy.word }}</span
        >
      </div>
      <div class="tool-game-score">
        得分 {{ score }} · 漏过 {{ missed }} · 当前 {{ current || '—' }}
      </div>
      <label class="tool-field"
        ><span>输入单词</span
        ><input v-model="input" :disabled="!running" autocomplete="off" /></label
      ><ToolActions
        ><button type="button" class="tool-button tool-button--primary" @click="start">
          开始 / 重开</button
        ><button type="button" class="tool-button tool-button--quiet" @click="stop">
          暂停
        </button></ToolActions
      >
    </div></ToolSection
  ><ToolHelp
    :steps="['点击开始生成敌机单词。', '输入最靠近底线的单词。', '完全匹配后自动消除并计分。']"
  />
</template>
