<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { IconCopy, IconRoute } from '@tabler/icons-vue';
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
let noticeTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

async function copyAlgorithm(): Promise<void> {
  if (!props.solution) return;
  try {
    await navigator.clipboard.writeText(props.solution.algorithm);
    notice.value = '公式已复制';
  } catch {
    notice.value = '复制失败，请手动选择公式。';
  }
  if (noticeTimer !== undefined) globalThis.clearTimeout(noticeTimer);
  noticeTimer = globalThis.setTimeout(() => {
    notice.value = '';
    noticeTimer = undefined;
  }, 1800);
}

onBeforeUnmount(() => {
  if (noticeTimer !== undefined) globalThis.clearTimeout(noticeTimer);
});
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
      <p>{{ message || '完成录入并通过状态校验后生成快速还原步骤。' }}</p>
    </div>
    <template v-else>
      <header class="cube-solution-panel__header">
        <div>
          <span>快速还原</span>
          <strong>{{ solution.moveCount }} 步</strong>
        </div>
        <button type="button" @click="copyAlgorithm">
          <IconCopy :size="15" aria-hidden="true" />复制公式
        </button>
      </header>
      <p v-if="notice" class="cube-inline-notice" role="status">{{ notice }}</p>
      <ol class="cube-solution-steps">
        <li
          v-for="(move, index) in solution.moves"
          :key="`${index}-${move.notation}`"
          :class="{ 'is-current': cursor === index, 'is-complete': cursor > index }"
        >
          <button type="button" @click="emit('seek', index)">
            <small>步骤 {{ index + 1 }}</small>
            <strong>{{ move.notation }}</strong>
            <span>{{ describeMove(move) }}</span>
          </button>
        </li>
      </ol>
    </template>
  </section>
</template>
