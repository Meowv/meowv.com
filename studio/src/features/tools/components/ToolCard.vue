<script setup lang="ts">
import { computed } from 'vue';
import { IconArrowRight } from '@tabler/icons-vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import { toolCategoryMap, type ToolConfig } from '@/features/tools/config/tools';

const props = withDefaults(defineProps<{ tool: ToolConfig; compact?: boolean }>(), {
  compact: false,
});

const category = computed(() => toolCategoryMap.get(props.tool.category));
const accentStyle = computed(() => ({ '--tool-accent': category.value?.accent }));
</script>

<template>
  <RouterLink
    class="tools-card"
    :class="{ 'tools-card--compact': compact }"
    :to="tool.route"
    :style="accentStyle"
  >
    <span class="tools-card__icon">
      <ToolIcon :name="tool.icon" />
    </span>
    <span class="tools-card__content">
      <strong>{{ tool.name }}</strong>
      <small>{{ tool.description }}</small>
    </span>
    <IconArrowRight v-if="compact" class="tools-card__arrow" :size="18" aria-hidden="true" />
  </RouterLink>
</template>
