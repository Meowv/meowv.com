<script setup lang="ts">
import { computed, inject, onBeforeUnmount, watch } from 'vue';
import { TOOL_HELP_REGISTRATION } from '@/features/tools/components/toolHelpContext';

const props = withDefaults(
  defineProps<{
    title?: string;
    steps: readonly string[];
    note?: string;
  }>(),
  {
    title: '使用说明',
    note: '',
  },
);

const registration = inject(TOOL_HELP_REGISTRATION, null);
const content = computed(() => ({
  title: props.title,
  steps: props.steps,
  note: props.note,
}));

watch(
  content,
  (value) => registration?.(value),
  { immediate: true },
);

onBeforeUnmount(() => registration?.(null));
</script>

<template>
  <article v-if="!registration" class="tool-help">
    <p class="eyebrow">HOW TO USE</p>
    <h2>{{ title }}</h2>
    <ol>
      <li v-for="step in steps" :key="step">{{ step }}</li>
    </ol>
    <p v-if="note" class="tool-help__note">{{ note }}</p>
  </article>
</template>
