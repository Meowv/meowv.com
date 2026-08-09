<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  tone?: 'default' | 'output' | 'error';
}>();
</script>

<template>
  <section class="tool-section" :class="`tool-section--${tone ?? 'default'}`">
    <header class="tool-section__header">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="tool-section__header-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="tool-section__body">
      <slot />
    </div>
  </section>
</template>
