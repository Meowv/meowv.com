<script setup lang="ts">
import { FileText } from "@lucide/vue";

withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  {
    compact: false
  }
);
</script>

<template>
  <NuxtLink class="app-logo" to="/" aria-label="在线 PDF 处理首页">
    <span class="app-logo__mark" aria-hidden="true">
      <FileText :size="23" :stroke-width="2.1" />
      <span class="app-logo__ear app-logo__ear--left" />
      <span class="app-logo__ear app-logo__ear--right" />
    </span>
    <span class="app-logo__copy">
      <strong>在线 PDF 处理</strong>
      <small v-if="!compact">Meowv PDF</small>
    </span>
  </NuxtLink>
</template>
