<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IconApps, IconChevronRight, IconMenu2 } from '@tabler/icons-vue';
import ToolCard from '@/features/tools/components/ToolCard.vue';
import ToolHeader from '@/features/tools/components/ToolHeader.vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import ToolSidebar from '@/features/tools/components/ToolSidebar.vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import { useToolCatalog } from '@/features/tools/composables/useToolCatalog';
import { useToolFavorites } from '@/features/tools/composables/useToolFavorites';
import {
  toolCategories,
  type ToolCategoryConfig,
  type InternalToolConfig,
} from '@/features/tools/tools';

const props = defineProps<{
  tool: InternalToolConfig;
  category: ToolCategoryConfig;
}>();

const SIDEBAR_PIN_KEY = `${STORAGE_POLICY.preferences}:tools-sidebar-pinned`;
const SIDEBAR_SIDE_KEY = `${STORAGE_POLICY.preferences}:tools-sidebar-side`;
const router = useRouter();
const { tools: catalogTools, aiSites, bookmarks, refreshLinks } = useToolCatalog();
const { favoriteIds, isFavorite, toggleFavorite } = useToolFavorites();
const sidebarOpen = ref(false);
const sidebarPinned = ref(readSidebarPinned());
const sidebarSide = ref(readSidebarSide());
const sidebarHovered = ref(false);
const sidebarVisible = computed(
  () => sidebarOpen.value || sidebarPinned.value || sidebarHovered.value,
);
const sidebarButton = ref<HTMLButtonElement | null>(null);

const relatedTools = computed(() =>
  catalogTools.value.filter(
    (item) => item.category === props.category.id && item.id !== props.tool.id,
  ),
);
const favorite = computed(() => isFavorite(props.tool.id));

function readSidebarPinned(): boolean {
  if (!storageAvailable()) return false;
  try {
    return localStorage.getItem(SIDEBAR_PIN_KEY) === 'true';
  } catch {
    return false;
  }
}

function readSidebarSide(): 'left' | 'right' {
  if (!storageAvailable()) return 'left';
  try {
    return localStorage.getItem(SIDEBAR_SIDE_KEY) === 'right' ? 'right' : 'left';
  } catch {
    return 'left';
  }
}

function setSidebarPinned(pinned: boolean): void {
  sidebarPinned.value = pinned;
  sidebarHovered.value = pinned;
  if (!storageAvailable()) return;
  try {
    if (pinned) localStorage.setItem(SIDEBAR_PIN_KEY, 'true');
    else localStorage.removeItem(SIDEBAR_PIN_KEY);
  } catch {
    // 本地偏好不可用时仅保留当前页面状态。
  }
}

function setSidebarSide(side: 'left' | 'right'): void {
  sidebarSide.value = side;
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(SIDEBAR_SIDE_KEY, side);
  } catch {
    // 本地偏好不可用时仅保留当前页面状态。
  }
}

function handleSidebarLeave(): void {
  if (sidebarPinned.value || sidebarOpen.value) return;
  sidebarHovered.value = false;
}

function selectCategory(categoryId: string): void {
  sidebarOpen.value = false;
  void router.push({ path: '/tools', hash: `#${categoryId}` });
}

function selectFavorites(): void {
  sidebarOpen.value = false;
  void router.push({ path: '/tools', hash: '#favorites' });
}

function selectBookmarks(): void {
  sidebarOpen.value = false;
  void router.push({ path: '/tools', hash: '#bookmarks' });
}

function selectAi(): void {
  sidebarOpen.value = false;
  void router.push({ path: '/tools', hash: '#ai' });
}

async function openSidebar(): Promise<void> {
  sidebarOpen.value = true;
  await nextTick();
  document.querySelector<HTMLElement>('#tool-detail-categories nav button')?.focus();
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
  void refreshLinks();
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div
    class="tool-detail-shell"
    :class="{
      'tool-detail-shell--sidebar-pinned': sidebarPinned,
      'tool-detail-shell--sidebar-open': sidebarOpen,
      'tool-detail-shell--sidebar-right': sidebarSide === 'right',
    }"
  >
    <button
      v-if="sidebarOpen"
      type="button"
      class="tool-detail-sidebar-backdrop"
      aria-label="关闭工具分类"
      @click="closeSidebar()"
    ></button>
    <ToolSidebar
      id="tool-detail-categories"
      :categories="toolCategories"
      :active-category="category.id"
      :visible="sidebarVisible"
      :pinned="sidebarPinned"
      :side="sidebarSide"
      :search-visible="true"
      :search-button="false"
      :favorites-visible="favoriteIds.length > 0"
      :ai-visible="aiSites.length > 0"
      :bookmarks-visible="bookmarks.length > 0"
      @enter="sidebarHovered = true"
      @leave="handleSidebarLeave"
      @select="selectCategory"
      @select-favorites="selectFavorites"
      @select-ai="selectAi"
      @select-bookmarks="selectBookmarks"
      @update:pinned="setSidebarPinned"
      @update:side="setSidebarSide"
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
        <RouterLink to="/tools">
          <IconApps :size="14" aria-hidden="true" />
          工具
        </RouterLink>
        <IconChevronRight :size="14" aria-hidden="true" />
        <RouterLink :to="`/tools#${category.id}`">
          <ToolIcon :icon="category.icon" :size="14" />
          {{ category.label }}
        </RouterLink>
        <IconChevronRight :size="14" aria-hidden="true" />
        <span aria-current="page">
          <ToolIcon :icon="tool.icon" :size="14" />
          {{ tool.name }}
        </span>
      </nav>

      <ToolHeader
        :title="tool.name"
        :description="tool.description"
        :icon="tool.icon"
        :category="category.label"
        :favorite="favorite"
        @toggle-favorite="toggleFavorite(tool.id)"
      />

      <div class="tools-detail__content">
        <slot />
      </div>

      <section
        v-if="relatedTools.length"
        class="tools-detail__related"
        aria-labelledby="related-title"
      >
        <div class="tools-detail__section-heading">
          <h2 id="related-title">
            <ToolIcon icon="icons" :size="18" />
            相关工具
          </h2>
        </div>
        <div class="tools-detail__related-grid">
          <ToolCard
            v-for="item in relatedTools"
            :key="item.id"
            :tool="item"
            :favorite="isFavorite(item.id)"
            compact
            @toggle-favorite="toggleFavorite"
          />
        </div>
      </section>
    </div>
  </div>
</template>
