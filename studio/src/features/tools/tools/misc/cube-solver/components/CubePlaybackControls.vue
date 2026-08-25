<script setup lang="ts">
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
} from '@tabler/icons-vue';
import { describeMove } from '../core/notation';
import type { CubeMove } from '../types';

defineProps<{
  cursor: number;
  total: number;
  playing: boolean;
  speed: number;
  currentMove: CubeMove | null;
}>();

const emit = defineEmits<{
  start: [];
  previous: [];
  toggle: [];
  next: [];
  end: [];
  seek: [cursor: number];
  'update:speed': [speed: number];
}>();
</script>

<template>
  <section class="cube-playback" aria-label="步骤播放控制">
    <div class="cube-playback__current" aria-live="polite">
      <span>{{ total ? `第 ${Math.min(cursor + 1, total)} / ${total} 步` : '等待生成步骤' }}</span>
      <strong>{{ currentMove?.notation ?? '—' }}</strong>
      <small>{{ currentMove ? describeMove(currentMove) : '录入状态或输入公式后开始。' }}</small>
    </div>
    <div class="cube-playback__buttons">
      <button
        type="button"
        :disabled="!total || cursor === 0"
        title="回到开始"
        aria-label="回到开始"
        @click="emit('start')"
      >
        <IconPlayerTrackPrev :size="17" aria-hidden="true" />
      </button>
      <button
        type="button"
        :disabled="!total || cursor === 0"
        title="上一步"
        aria-label="上一步"
        @click="emit('previous')"
      >
        <IconPlayerSkipBack :size="17" aria-hidden="true" />
      </button>
      <button
        class="is-primary"
        type="button"
        :disabled="!total"
        :title="playing ? '暂停' : '播放'"
        :aria-label="playing ? '暂停' : '播放'"
        @click="emit('toggle')"
      >
        <IconPlayerPause v-if="playing" :size="19" aria-hidden="true" />
        <IconPlayerPlay v-else :size="19" aria-hidden="true" />
      </button>
      <button
        type="button"
        :disabled="!total || cursor >= total"
        title="下一步"
        aria-label="下一步"
        @click="emit('next')"
      >
        <IconPlayerSkipForward :size="17" aria-hidden="true" />
      </button>
      <button
        type="button"
        :disabled="!total || cursor >= total"
        title="跳到结束"
        aria-label="跳到结束"
        @click="emit('end')"
      >
        <IconPlayerTrackNext :size="17" aria-hidden="true" />
      </button>
    </div>
    <label class="cube-playback__timeline">
      <span class="visually-hidden">播放进度</span>
      <input
        type="range"
        min="0"
        :max="total"
        :value="cursor"
        :disabled="!total"
        @input="emit('seek', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <label class="cube-playback__speed">
      <span>速度</span>
      <select
        :value="speed"
        @change="emit('update:speed', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="value in [0.25, 0.5, 0.75, 1, 1.5, 2, 3]" :key="value" :value="value">
          {{ value }}×
        </option>
      </select>
    </label>
  </section>
</template>
