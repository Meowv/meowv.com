<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { IconCheck, IconCopy } from '@tabler/icons-vue';

const props = withDefaults(
  defineProps<{
    text: string;
    label?: string;
  }>(),
  { label: '复制' },
);

const state = ref<'idle' | 'copied' | 'error'>('idle');
let resetTimer: number | undefined;

async function copy(): Promise<void> {
  if (!props.text) return;
  try {
    await navigator.clipboard.writeText(props.text);
    state.value = 'copied';
  } catch {
    state.value = 'error';
  }
  window.clearTimeout(resetTimer);
  resetTimer = window.setTimeout(() => {
    state.value = 'idle';
  }, 1800);
}

onBeforeUnmount(() => window.clearTimeout(resetTimer));
</script>

<template>
  <button
    type="button"
    class="tool-button tool-button--quiet"
    :disabled="!text"
    :title="state === 'error' ? '复制失败，请手动选择内容' : undefined"
    @click="copy"
  >
    <IconCheck v-if="state === 'copied'" :size="16" aria-hidden="true" />
    <IconCopy v-else :size="16" aria-hidden="true" />
    {{ state === 'copied' ? '已复制' : state === 'error' ? '复制失败' : label }}
  </button>
</template>
