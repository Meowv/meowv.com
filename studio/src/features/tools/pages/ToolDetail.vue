<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue';
import { useRoute } from 'vue-router';
import { IconInfoCircle, IconPlayerPlay, IconFileExport } from '@tabler/icons-vue';
import ToolCard from '@/features/tools/components/ToolCard.vue';
import ToolHeader from '@/features/tools/components/ToolHeader.vue';
import { toolCategoryMap, type ToolCategoryId } from '@/features/tools/config/toolCategories';
import { getToolById, getToolsByCategory } from '@/features/tools/config/tools';
import '@/features/tools/tools.css';

const route = useRoute();
const toolId = computed(() => String(route.params.toolId));
const tool = computed(() => getToolById(toolId.value));
const category = computed(() =>
  tool.value ? toolCategoryMap.get(tool.value.category as ToolCategoryId) : undefined,
);
const relatedTools = computed(() =>
  tool.value && category.value
    ? getToolsByCategory(category.value.id)
        .filter((item) => item.id !== tool.value?.id)
        .slice(0, 3)
    : [],
);

const toolComponentLoaders = import.meta.glob<{ default: Component }>('../tools/*.vue');
const toolComponent = computed(() => {
  if (!tool.value) return null;
  const loader = toolComponentLoaders[`../tools/${tool.value.id}.vue`];
  return loader ? defineAsyncComponent(() => loader().then((module) => module.default)) : null;
});
</script>

<template>
  <section v-if="tool && category" class="tools-page tools-detail" aria-labelledby="tool-title">
    <ToolHeader
      eyebrow="STUDIO TOOLS"
      :title="tool.name"
      :description="tool.description"
      :back-to="`/tools#${category.id}`"
      :back-label="`返回 ${category.label}`"
    >
      <template #aside>
        <div class="tools-detail__meta">
          <RouterLink :to="`/tools#${category.id}`">{{ category.label }}</RouterLink>
        </div>
      </template>
    </ToolHeader>

    <component :is="toolComponent" v-if="toolComponent" />
    <section v-else class="tools-workspace" aria-label="工具工作区预览">
      <div class="tools-workspace__panel tools-workspace__panel--input">
        <div class="tools-workspace__panel-title">
          <IconInfoCircle :size="19" aria-hidden="true" />
          <strong>Input Area</strong>
          <span>输入区域</span>
        </div>
        <div class="tools-workspace__placeholder">此处将用于输入文本、数据或本地文件</div>
      </div>

      <div class="tools-workspace__panel tools-workspace__panel--action">
        <div class="tools-workspace__panel-title">
          <IconPlayerPlay :size="19" aria-hidden="true" />
          <strong>Action Area</strong>
          <span>操作区域</span>
        </div>
        <button type="button" disabled>功能开发中</button>
      </div>

      <div class="tools-workspace__panel tools-workspace__panel--output">
        <div class="tools-workspace__panel-title">
          <IconFileExport :size="19" aria-hidden="true" />
          <strong>Output Area</strong>
          <span>输出区域</span>
        </div>
        <div class="tools-workspace__placeholder">处理结果将在这里显示</div>
      </div>
    </section>

    <section class="tools-detail__information" aria-label="工具信息">
      <article>
        <p class="eyebrow">ABOUT</p>
        <h2>工具说明</h2>
        <p>
          {{ tool.name }} 将在浏览器中直接完成处理，不依赖后端服务，也不会上传你的输入内容。
          当前页面为第一阶段统一模板，功能将在后续阶段逐步开放。
        </p>
      </article>
      <article>
        <p class="eyebrow">HOW TO USE</p>
        <h2>使用方式</h2>
        <ol>
          <li>在 Input Area 中提供需要处理的内容。</li>
          <li>在 Action Area 中选择操作并开始处理。</li>
          <li>在 Output Area 中查看、复制或导出结果。</li>
        </ol>
      </article>
    </section>

    <section v-if="relatedTools.length" class="tools-section tools-detail__related">
      <div class="tools-section__header">
        <div>
          <p class="eyebrow">RELATED</p>
          <h2>相关工具</h2>
        </div>
        <RouterLink :to="`/tools#${category.id}`">查看 {{ category.label }}</RouterLink>
      </div>
      <div class="tools-grid">
        <ToolCard v-for="item in relatedTools" :key="item.id" :tool="item" />
      </div>
    </section>
  </section>

  <section v-else class="tools-page tools-route-empty">
    <p class="eyebrow">TOOL NOT FOUND</p>
    <h1>这个工具不存在</h1>
    <p>工具标识可能已变更，返回 Tools 首页搜索现有工具。</p>
    <RouterLink class="button button--primary" to="/tools">返回 Tools</RouterLink>
  </section>
</template>
