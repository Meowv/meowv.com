<script setup lang="ts">
import { IconChevronLeft } from '@tabler/icons-vue';

defineProps<{
  eyebrow: string;
  title: string;
  description: string;
  backTo?: string;
  backLabel?: string;
}>();
</script>

<template>
  <header class="tools-page-header">
    <RouterLink v-if="backTo" class="tools-page-header__back" :to="backTo">
      <IconChevronLeft :size="17" aria-hidden="true" />
      <span>{{ backLabel ?? '返回 Tools' }}</span>
    </RouterLink>
    <p class="eyebrow">{{ eyebrow }}</p>
    <div class="tools-page-header__title-row">
      <div>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <slot name="aside" />
    </div>
    <slot />
  </header>
</template>
