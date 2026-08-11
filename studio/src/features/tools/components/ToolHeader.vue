<script setup lang="ts">
import { IconChevronLeft, IconStar, IconStarFilled } from '@tabler/icons-vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import type { ToolIconSource } from '@/features/tools/tools';

defineProps<{
  title: string;
  description: string;
  icon?: ToolIconSource;
  category?: string;
  backTo?: string;
  backLabel?: string;
  favorite?: boolean;
}>();

const emit = defineEmits<{
  'toggle-favorite': [];
}>();
</script>

<template>
  <header class="tools-page-header">
    <RouterLink v-if="backTo" class="tools-page-header__back" :to="backTo">
      <IconChevronLeft :size="17" aria-hidden="true" />
      <span>{{ backLabel ?? '返回 Tools' }}</span>
    </RouterLink>
    <span v-if="icon" class="tools-page-header__icon" aria-hidden="true">
      <ToolIcon :icon="icon" :size="26" />
    </span>
    <div class="tools-page-header__content">
      <div>
        <div class="tools-page-header__title-row">
          <h1 id="tool-title">{{ title }}</h1>
          <span v-if="category" class="tools-page-header__category">{{ category }}</span>
        </div>
        <p>{{ description }}</p>
      </div>
    </div>
    <div class="tools-page-header__aside">
      <slot name="aside" />
      <button
        type="button"
        class="tools-page-header__favorite"
        :class="{ 'is-active': favorite }"
        :aria-pressed="favorite"
        :aria-label="favorite ? '取消收藏' : '收藏工具'"
        @click="emit('toggle-favorite')"
      >
        <IconStarFilled v-if="favorite" :size="18" aria-hidden="true" />
        <IconStar v-else :size="18" aria-hidden="true" />
        {{ favorite ? '已收藏' : '收藏' }}
      </button>
    </div>
  </header>
</template>
