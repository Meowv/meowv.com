<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    tone?: 'input' | 'output';
    status?: string;
    statusTone?: 'success' | 'error' | 'neutral';
  }>(),
  {
    tone: 'input',
    status: '',
    statusTone: 'neutral',
  },
);
</script>

<template>
  <section class="tool-pane" :class="`tool-pane--${tone}`">
    <header class="tool-pane__header">
      <div class="tool-pane__heading">
        <h2>{{ title }}</h2>
        <span v-if="status" class="tool-pane__status" :class="`tool-pane__status--${statusTone}`">
          {{ status }}
        </span>
      </div>
      <div v-if="$slots.actions" class="tool-pane__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="tool-pane__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="tool-pane__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>
