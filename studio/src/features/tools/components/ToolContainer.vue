<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { IconChevronRight, IconMenu2 } from '@tabler/icons-vue';
import ToolCard from '@/features/tools/components/ToolCard.vue';
import ToolDataBoundaryNotice from '@/features/tools/components/ToolDataBoundaryNotice.vue';
import ToolDetailSidebar from '@/features/tools/components/ToolDetailSidebar.vue';
import ToolHeader from '@/features/tools/components/ToolHeader.vue';
import { TOOL_HELP_REGISTRATION, type ToolHelpContent } from '@/features/tools/components/toolHelpContext';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import type { ToolCategoryConfig } from '@/features/tools/config/toolCategories';
import { getToolById, type ToolConfig } from '@/features/tools/config/tools';

const props = defineProps<{
  tool: ToolConfig;
  category: ToolCategoryConfig;
}>();

const FAVORITES_KEY = `${STORAGE_POLICY.preferences}:tools-favorites`;
const favoriteIds = ref<string[]>([]);
const sidebarOpen = ref(false);
const sidebarButton = ref<HTMLButtonElement | null>(null);
const help = ref<ToolHelpContent | null>(null);

provide(TOOL_HELP_REGISTRATION, (content) => {
  help.value = content;
});

const relatedTools = computed(() =>
  props.tool.relatedToolIds
    .map((toolId) => getToolById(toolId))
    .filter((item): item is ToolConfig => Boolean(item)),
);
const favorite = computed(() => favoriteIds.value.includes(props.tool.id));

function readFavorites(): void {
  if (!storageAvailable()) return;
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]') as unknown;
    favoriteIds.value = Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    favoriteIds.value = [];
  }
}

function toggleFavorite(): void {
  favoriteIds.value = favorite.value
    ? favoriteIds.value.filter((toolId) => toolId !== props.tool.id)
    : [...favoriteIds.value, props.tool.id];
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds.value));
  } catch {
    // 本地偏好不可用时仍保留当前页面状态。
  }
}

async function openSidebar(): Promise<void> {
  sidebarOpen.value = true;
  await nextTick();
  document.querySelector<HTMLElement>('#tool-detail-categories a')?.focus();
}

function closeSidebar(restoreFocus = true): void {
  if (!sidebarOpen.value) return;
  sidebarOpen.value = false;
  if (restoreFocus) void nextTick(() => sidebarButton.value?.focus());
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeSidebar();
}

onMounted(() => {
  readFavorites();
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div class="tool-detail-shell">
    <button
      v-if="sidebarOpen"
      type="button"
      class="tool-detail-sidebar-backdrop"
      aria-label="关闭工具分类"
      @click="closeSidebar()"
    ></button>
    <ToolDetailSidebar
      :active-category="category.id"
      :open="sidebarOpen"
      @close="closeSidebar()"
    />

    <div class="tool-detail-main">
      <nav class="tool-detail-breadcrumb" aria-label="面包屑">
        <button
          ref="sidebarButton"
          type="button"
          class="tool-detail-breadcrumb__menu"
          aria-controls="tool-detail-categories"
          :aria-expanded="sidebarOpen"
          @click="openSidebar"
        >
          <IconMenu2 :size="18" aria-hidden="true" />
          工具分类
        </button>
        <RouterLink to="/tools">工具</RouterLink>
        <IconChevronRight :size="14" aria-hidden="true" />
        <RouterLink :to="`/tools#${category.id}`">{{ category.label }}</RouterLink>
        <IconChevronRight :size="14" aria-hidden="true" />
        <span aria-current="page">{{ tool.name }}</span>
      </nav>

      <ToolHeader
        eyebrow="STUDIO TOOLS"
        :title="tool.name"
        :description="tool.description"
        :icon="tool.icon"
        :category="category.label"
        :favorite="favorite"
        @toggle-favorite="toggleFavorite"
      />

      <ToolDataBoundaryNotice :boundary="tool.dataBoundary" />

      <div class="tools-detail__content" :data-layout="tool.layout" :data-settings="tool.settingsMode">
        <slot />
      </div>

      <section v-if="relatedTools.length" class="tools-detail__related" aria-labelledby="related-title">
        <div class="tools-detail__section-heading">
          <h2 id="related-title">相关工具</h2>
          <RouterLink :to="`/tools#${category.id}`">查看 {{ category.label }}</RouterLink>
        </div>
        <div class="tools-detail__related-grid">
          <ToolCard v-for="item in relatedTools" :key="item.id" :tool="item" compact />
        </div>
      </section>

      <details v-if="help" class="tools-detail__help">
        <summary>{{ help.title }}</summary>
        <div class="tools-detail__help-content">
          <ol>
            <li v-for="step in help.steps" :key="step">{{ step }}</li>
          </ol>
          <p v-if="help.note">{{ help.note }}</p>
        </div>
      </details>
    </div>
  </div>
</template>
