<script setup lang="ts">
withDefaults(
  defineProps<{
    layout?: 'split' | 'single';
    label?: string;
  }>(),
  {
    layout: 'split',
    label: '工具工作区',
  },
);
</script>

<template>
  <section class="tool-workspace" :class="`tool-workspace--${layout}`" :aria-label="label">
    <slot />
  </section>
</template>
