<script setup lang="ts">
import { computed } from 'vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import { toolCategoryMap, type ToolCategoryId } from '@/features/tools/config/toolCategories';
import type { ToolConfig } from '@/features/tools/config/tools';

const props = defineProps<{ tool: ToolConfig }>();

const category = computed(() => toolCategoryMap.get(props.tool.category as ToolCategoryId));
const accentStyle = computed(() => ({ '--tool-accent': category.value?.accent }));
</script>

<template>
  <RouterLink class="tools-card" :to="tool.route" :style="accentStyle">
    <span class="tools-card__icon">
      <ToolIcon :name="tool.icon" />
    </span>
    <span class="tools-card__content">
      <strong>{{ tool.name }}</strong>
      <small>{{ tool.description }}</small>
    </span>
  </RouterLink>
</template>
