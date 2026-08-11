<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { IconArrowRight, IconStar, IconStarFilled } from '@tabler/icons-vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import { toolCategoryMap, type ToolConfig } from '@/features/tools/tools';

const props = withDefaults(
  defineProps<{ tool: ToolConfig; compact?: boolean; favorite?: boolean }>(),
  { compact: false, favorite: false },
);

const emit = defineEmits<{
  'toggle-favorite': [toolId: string];
}>();

const category = computed(() => toolCategoryMap.get(props.tool.category));
const accentStyle = computed(() => ({ '--tool-accent': category.value?.color }));
const targetComponent = computed(() => (props.tool.type === 'link' ? 'a' : RouterLink));
const targetAttributes = computed(() =>
  props.tool.type === 'link'
    ? {
        href: props.tool.url,
        target: '_blank',
        rel: 'noopener noreferrer',
      }
    : { to: props.tool.route },
);
</script>

<template>
  <article class="tools-card" :class="{ 'tools-card--compact': compact }" :style="accentStyle">
    <component
      :is="targetComponent"
      class="tools-card__target"
      v-bind="targetAttributes"
      :aria-label="tool.name"
    />
    <span class="tools-card__icon">
      <ToolIcon :icon="tool.icon" />
    </span>
    <span class="tools-card__content">
      <strong>{{ tool.name }}</strong>
      <small>{{ tool.description }}</small>
    </span>
    <IconArrowRight v-if="compact" class="tools-card__arrow" :size="18" aria-hidden="true" />
    <button
      class="tools-card__favorite"
      :class="{ 'is-active': favorite }"
      type="button"
      :aria-label="favorite ? `取消收藏 ${tool.name}` : `收藏 ${tool.name}`"
      :title="favorite ? '取消收藏' : '收藏'"
      :aria-pressed="favorite"
      @click.stop="emit('toggle-favorite', tool.id)"
    >
      <IconStarFilled v-if="favorite" :size="15" aria-hidden="true" />
      <IconStar v-else :size="15" aria-hidden="true" />
    </button>
  </article>
</template>
