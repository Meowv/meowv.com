<script setup lang="ts">
import { computed } from 'vue';
import { IconShieldCheck } from '@tabler/icons-vue';
import ToolCard from '@/features/tools/components/ToolCard.vue';
import ToolHeader from '@/features/tools/components/ToolHeader.vue';
import type { ToolCategoryConfig } from '@/features/tools/config/toolCategories';
import { getToolsByCategory, type ToolConfig } from '@/features/tools/config/tools';

const props = defineProps<{
  tool: ToolConfig;
  category: ToolCategoryConfig;
}>();

const relatedTools = computed(() =>
  getToolsByCategory(props.category.id).filter((item) => item.id !== props.tool.id),
);
</script>

<template>
  <ToolHeader
    legacy
    eyebrow="STUDIO TOOLS"
    :title="tool.name"
    :description="tool.description"
    :icon="tool.icon"
    :category="category.label"
    :back-to="`/tools#${category.id}`"
    :back-label="`返回 ${category.name}`"
  >
    <template #aside>
      <span class="tools-local-badge">
        <IconShieldCheck :size="16" aria-hidden="true" />
        本地处理 · 内容不上传
      </span>
    </template>
  </ToolHeader>

  <div class="tools-detail__content">
    <slot />
  </div>

  <section
    v-if="relatedTools.length"
    class="tools-detail__related"
    aria-labelledby="legacy-related-title"
  >
    <div class="tools-detail__section-heading">
      <div>
        <p class="eyebrow">RELATED</p>
        <h2 id="legacy-related-title">相关工具</h2>
      </div>
    </div>
    <div class="tools-grid">
      <ToolCard v-for="item in relatedTools" :key="item.id" :tool="item" />
    </div>
  </section>
</template>
