<script setup lang="ts">
import { ArrowRight } from "@lucide/vue";
import AppToolIcon from "~/components/common/AppToolIcon.vue";
import type { PdfToolDefinition } from "~/config/tools";

defineProps<{
  tool: PdfToolDefinition;
}>();
</script>

<template>
  <NuxtLink class="tool-card" :to="`/${tool.slug}`">
    <span class="tool-card__icon" aria-hidden="true">
      <AppToolIcon :name="tool.icon" :size="23" :stroke-width="1.8" />
    </span>
    <span class="tool-card__content">
      <strong>{{ tool.name }}</strong>
      <span>{{ tool.description }}</span>
    </span>
    <ArrowRight class="tool-card__arrow" :size="18" aria-hidden="true" />
  </NuxtLink>
</template>
