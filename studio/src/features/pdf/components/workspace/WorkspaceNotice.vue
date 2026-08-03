<script setup lang="ts">
import { AlertTriangle, Info, ShieldCheck } from '@/features/pdf/icons';

withDefaults(
  defineProps<{
    type?: 'info' | 'warning' | 'error' | 'privacy';
    title?: string;
  }>(),
  {
    type: 'info',
    title: '',
  },
);
</script>

<template>
  <div class="notice" :class="`notice--${type}`" role="status">
    <ShieldCheck v-if="type === 'privacy'" :size="18" aria-hidden="true" />
    <AlertTriangle
      v-else-if="type === 'warning' || type === 'error'"
      :size="18"
      aria-hidden="true"
    />
    <Info v-else :size="18" aria-hidden="true" />
    <div>
      <strong v-if="title">{{ title }}</strong>
      <slot />
    </div>
  </div>
</template>
