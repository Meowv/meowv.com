<script setup lang="ts">
import { ArrowRight } from '@/features/pdf/icons';
import AppToolIcon from '@/features/pdf/components/common/AppToolIcon.vue';
import type { PdfToolDefinition } from '@/features/pdf/config/tools';

defineProps<{
  tool: PdfToolDefinition;
}>();
</script>

<template>
  <RouterLink class="tool-hub__card" :to="`/pdf/${tool.slug}`">
    <span class="tool-hub__card-icon" aria-hidden="true">
      <AppToolIcon :name="tool.icon" :size="23" :stroke-width="1.8" />
    </span>
    <span class="tool-hub__card-content">
      <strong>{{ tool.name }}</strong>
      <small>{{ tool.description }}</small>
    </span>
    <ArrowRight class="tool-hub__card-arrow" :size="18" aria-hidden="true" />
  </RouterLink>
</template>
