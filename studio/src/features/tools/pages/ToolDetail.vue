<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue';
import { useRoute } from 'vue-router';
import { usePageMeta } from '@/composables/usePageMeta';
import ToolContainer from '@/features/tools/components/ToolContainer.vue';
import { getToolById, toolCategoryMap } from '@/features/tools/tools';
import JsonEditorLoading from '@/features/tools/tools/developer/json/JsonEditorLoading.vue';
import '@/features/tools/tools.css';

const route = useRoute();
const tool = computed(() => getToolById(String(route.params.toolId)));
const category = computed(() =>
  tool.value ? toolCategoryMap.get(tool.value.category) : undefined,
);

const componentLoaders = import.meta.glob<Component>('../tools/*/*/index.vue', {
  eager: false,
  import: 'default',
});
// 工具目录由分类和配置 id 直接映射，新增工具无需再维护组件注册表。
const toolComponents: Record<string, Component> = Object.fromEntries(
  Object.entries(componentLoaders).map(([modulePath, loader]) => [
    modulePath,
    defineAsyncComponent(
      modulePath === '../tools/developer/json/index.vue'
        ? {
            loader,
            loadingComponent: JsonEditorLoading,
            delay: 0,
          }
        : loader,
    ),
  ]),
);
function getToolModulePath(categoryId: string, toolId: string): string {
  return `../tools/${categoryId}/${toolId}/index.vue`;
}
function resolveToolComponent(categoryId: string, toolId: string): Component | null {
  return toolComponents[getToolModulePath(categoryId, toolId)] ?? null;
}
const toolComponent = computed<Component | null>(() => {
  if (!tool.value) return null;
  return resolveToolComponent(tool.value.category, tool.value.id);
});
usePageMeta({
  title: () => `${tool.value?.name ?? '在线工具'} · Meowv Studio`,
  description: () => tool.value?.description ?? '在浏览器本地使用 Studio Tools。',
  canonical: () => (tool.value ? `https://studio.meowv.com${tool.value.route}` : undefined),
});
</script>

<template>
  <section
    v-if="tool && category"
    class="tools-detail-route"
    :style="{ '--tools-accent': category.color }"
    aria-labelledby="tool-title"
  >
    <ToolContainer :tool="tool" :category="category">
      <component :is="toolComponent" v-if="toolComponent" :key="tool.id" />
    </ToolContainer>
  </section>

  <section v-else class="tools-page tools-route-empty">
    <p class="eyebrow">TOOL NOT FOUND</p>
    <h1>这个工具不存在</h1>
    <p>工具标识可能已变更，返回 Tools 首页搜索现有工具。</p>
    <RouterLink class="button button--primary" to="/tools">返回 Tools</RouterLink>
  </section>
</template>
