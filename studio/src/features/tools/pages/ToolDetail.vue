<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue';
import { useRoute } from 'vue-router';
import { usePageMeta } from '@/composables/usePageMeta';
import ToolContainer from '@/features/tools/components/ToolContainer.vue';
import ToolUnavailable from '@/features/tools/components/ToolUnavailable.vue';
import { getToolById, toolCategoryMap } from '@/features/tools/config/tools';
import '@/features/tools/tools.css';

const route = useRoute();
const tool = computed(() => getToolById(String(route.params.toolId)));
const category = computed(() =>
  tool.value ? toolCategoryMap.get(tool.value.category) : undefined,
);

const componentLoaders = import.meta.glob<Component>('../tools/*/index.vue', {
  eager: false,
  import: 'default',
});
// 工具目录由配置 id 直接映射，新增工具无需再维护组件注册表。
const toolComponents: Record<string, Component> = Object.fromEntries(
  Object.entries(componentLoaders).map(([modulePath, loader]) => [
    modulePath,
    defineAsyncComponent(loader),
  ]),
);
function getToolModulePath(toolId: string): string {
  return `../tools/${toolId}/index.vue`;
}
function resolveToolComponent(toolId: string): Component | null {
  return toolComponents[getToolModulePath(toolId)] ?? null;
}
const toolComponent = computed<Component | null>(() => {
  if (!tool.value) return null;
  return resolveToolComponent(tool.value.id);
});
usePageMeta({
  title: () => tool.value?.seo?.title ?? `${tool.value?.name ?? '在线工具'} · Meowv Studio`,
  description: () =>
    tool.value?.seo?.description ?? tool.value?.description ?? '在浏览器本地使用 Studio Tools。',
  canonical: () => (tool.value ? `https://studio.meowv.com${tool.value.route}` : undefined),
});
</script>

<template>
  <section
    v-if="tool && category"
    class="tools-detail-route"
    :style="{ '--tools-accent': category.accent }"
    aria-labelledby="tool-title"
  >
    <ToolContainer :tool="tool" :category="category">
      <component :is="toolComponent" v-if="toolComponent" :key="tool.id" />
      <ToolUnavailable v-else />
    </ToolContainer>
  </section>

  <section v-else class="tools-page tools-route-empty">
    <p class="eyebrow">TOOL NOT FOUND</p>
    <h1>这个工具不存在</h1>
    <p>工具标识可能已变更，返回 Tools 首页搜索现有工具。</p>
    <RouterLink class="button button--primary" to="/tools">返回 Tools</RouterLink>
  </section>
</template>
