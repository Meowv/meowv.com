<script setup lang="ts">
import { IconChevronRight } from '@tabler/icons-vue';
import type { BookLocator, TocItem } from '../types/reader';

withDefaults(
  defineProps<{
    items: TocItem[];
    depth?: number;
  }>(),
  { depth: 0 },
);

defineEmits<{
  navigate: [locator: BookLocator];
}>();
</script>

<template>
  <div class="books-toc-tree">
    <template v-for="item in items" :key="`${item.label}-${JSON.stringify(item.locator)}`">
      <button
        type="button"
        class="books-toc-tree__item"
        :class="{ 'books-toc-tree__item--nested': depth > 0 }"
        :style="{ '--books-toc-depth': depth }"
        @click="$emit('navigate', item.locator)"
      >
        <span>{{ item.label }}</span
        ><IconChevronRight :size="15" aria-hidden="true" />
      </button>
      <TocTree
        v-if="item.children?.length"
        :items="item.children"
        :depth="depth + 1"
        @navigate="$emit('navigate', $event)"
      />
    </template>
  </div>
</template>
