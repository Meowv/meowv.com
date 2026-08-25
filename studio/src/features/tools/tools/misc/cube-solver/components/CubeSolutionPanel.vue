<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconCheck, IconCopy, IconRoute } from '@tabler/icons-vue';
import { describeMove } from '../core/notation';
import type { CubeSolution } from '../types';

const props = defineProps<{
  solution: CubeSolution | null;
  cursor: number;
  solverStatus: 'idle' | 'loading' | 'solving' | 'ready' | 'error';
  message: string;
}>();

const emit = defineEmits<{ seek: [cursor: number] }>();
const notice = ref('');
const phaseByMove = computed(() => {
  const result = new Map<number, string>();
  props.solution?.phases.forEach((phase) => {
    for (let index = phase.start; index < phase.end; index += 1) result.set(index, phase.title);
  });
  return result;
});
const solutionLabel = computed(() => {
  const labels = {
    quick: '快速还原',
    beginner: '七阶段跟练',
    algorithm: '公式演示',
    practice: '随机打乱',
  } as const;
  return props.solution ? labels[props.solution.mode] : '';
});

async function copyAlgorithm(): Promise<void> {
  if (!props.solution) return;
  try {
    await navigator.clipboard.writeText(props.solution.algorithm);
    notice.value = '公式已复制';
  } catch {
    notice.value = '复制失败，请手动选择公式。';
  }
  window.setTimeout(() => (notice.value = ''), 1800);
}
</script>

<template>
  <section class="cube-solution-panel" aria-label="还原步骤">
    <div
      v-if="solverStatus === 'loading' || solverStatus === 'solving'"
      class="cube-panel-empty"
      role="status"
      aria-live="polite"
    >
      <span class="cube-spinner" aria-hidden="true"></span>
      <strong>{{
        solverStatus === 'loading' ? '正在准备本地求解器…' : '正在计算较短还原步骤…'
      }}</strong>
      <p>计算在浏览器 Worker 中完成，页面仍可响应。</p>
    </div>
    <div v-else-if="!solution" class="cube-panel-empty">
      <IconRoute :size="30" aria-hidden="true" />
      <strong>{{ solverStatus === 'error' ? '暂时无法生成步骤' : '还没有还原步骤' }}</strong>
      <p>{{ message || '完成录入并通过状态校验后，选择一种还原方式。' }}</p>
    </div>
    <template v-else>
      <header class="cube-solution-panel__header">
        <div>
          <span>{{ solutionLabel }}</span>
          <strong>{{ solution.moveCount }} 步</strong>
        </div>
        <button type="button" @click="copyAlgorithm">
          <IconCopy :size="15" aria-hidden="true" />复制公式
        </button>
      </header>
      <p v-if="notice" class="cube-inline-notice" role="status">{{ notice }}</p>
      <div v-if="solution.phases.length" class="cube-solution-phases">
        <article
          v-for="phase in solution.phases"
          :key="phase.id"
          :class="{
            'is-active':
              (cursor >= phase.start && cursor < phase.end) ||
              (phase.start === phase.end && cursor === phase.start),
            'is-complete': cursor >= phase.end,
          }"
        >
          <span><IconCheck :size="13" aria-hidden="true" />{{ phase.title }}</span>
          <small>{{ phase.goal }}</small>
          <button type="button" @click="emit('seek', phase.start)">从这里演示</button>
        </article>
      </div>
      <ol class="cube-solution-steps">
        <li
          v-for="(move, index) in solution.moves"
          :key="`${index}-${move.notation}`"
          :class="{ 'is-current': cursor === index, 'is-complete': cursor > index }"
        >
          <button type="button" @click="emit('seek', index)">
            <small>{{ phaseByMove.get(index) ?? `步骤 ${index + 1}` }}</small>
            <strong>{{ move.notation }}</strong>
            <span>{{ describeMove(move) }}</span>
          </button>
        </li>
      </ol>
    </template>
  </section>
</template>
