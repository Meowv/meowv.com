<script setup lang="ts">
import { IconExternalLink } from '@tabler/icons-vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import type { BookmarkConfig } from '@/features/tools/composables/useToolCatalog';

defineProps<{ bookmark: BookmarkConfig }>();
</script>

<template>
  <a
    class="bookmark-card"
    :href="bookmark.url"
    target="_blank"
    rel="noopener noreferrer"
    :aria-label="`${bookmark.name}（在新标签页打开）`"
  >
    <span class="bookmark-card__icon">
      <ToolIcon :icon="bookmark.icon" />
    </span>
    <span class="bookmark-card__content">
      <strong>{{ bookmark.name }}</strong>
      <small>{{ bookmark.url }}</small>
    </span>
    <IconExternalLink class="bookmark-card__external" :size="12" aria-hidden="true" />
  </a>
</template>
