<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IconStarFilled } from '@tabler/icons-vue';
import ToolCard from '@/features/tools/components/ToolCard.vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import ToolSearch from '@/features/tools/components/ToolSearch.vue';
import ToolSidebar from '@/features/tools/components/ToolSidebar.vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import { useToolCatalog } from '@/features/tools/composables/useToolCatalog';
import { useToolFavorites } from '@/features/tools/composables/useToolFavorites';
import { searchTools, toolCategories } from '@/features/tools/tools';
import '@/features/tools/tools.css';

const route = useRoute();
const query = ref('');
const activeCategory = ref<string>(toolCategories[0]?.id ?? '');
const catalogElement = ref<HTMLElement | null>(null);
const sidebarHovered = ref(false);
const SIDEBAR_PIN_KEY = `${STORAGE_POLICY.preferences}:tools-sidebar-pinned`;
const SIDEBAR_SIDE_KEY = `${STORAGE_POLICY.preferences}:tools-sidebar-side`;
const SEARCH_VISIBILITY_KEY = `${STORAGE_POLICY.preferences}:tools-search-visible`;
const sidebarPinned = ref(readSidebarPinned());
const sidebarSide = ref(readSidebarSide());
const searchVisible = ref(readSearchVisible());
const { tools, refreshLinks } = useToolCatalog();
const { favoriteIds, isFavorite, toggleFavorite } = useToolFavorites();
const sidebarVisible = computed(() => sidebarPinned.value || sidebarHovered.value);
const filteredTools = computed(() => searchTools(query.value, tools.value));
const favoriteTools = computed(() =>
  tools.value.filter((tool) => favoriteIds.value.includes(tool.id)),
);
const toolGroups = computed(() =>
  toolCategories
    .map((category) => ({
      category,
      tools: filteredTools.value.filter((tool) => tool.category === category.id),
    }))
    .filter((group) => group.tools.length),
);

function updateActiveCategory(): void {
  const catalogTop = catalogElement.value?.getBoundingClientRect().top ?? 0;
  const toolbarBottom = document
    .querySelector<HTMLElement>('.tools-toolbar')
    ?.getBoundingClientRect().bottom;
  const anchorTop = toolbarBottom === undefined ? catalogTop + 12 : toolbarBottom + 4;
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.tools-category-section'));
  let current = sections[0]?.dataset.category;

  for (const section of sections) {
    if (section.getBoundingClientRect().top > anchorTop) break;
    current = section.dataset.category;
  }

  if (current) {
    activeCategory.value = current;
    const nextHash = `#${current}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(window.history.state, '', nextHash);
    }
  }
}

async function scrollToCategory(categoryId: string, behavior: ScrollBehavior = 'smooth') {
  if (query.value) query.value = '';
  await nextTick();

  const section = document.getElementById(`tools-category-${categoryId}`);
  if (!section) return;

  activeCategory.value = categoryId;
  section.scrollIntoView({ behavior, block: 'start' });
  window.history.replaceState(window.history.state, '', `#${categoryId}`);

  if (!sidebarPinned.value) {
    sidebarHovered.value = false;
  }
}

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

function readSearchVisible(): boolean {
  if (!storageAvailable()) return true;
  try {
    return localStorage.getItem(SEARCH_VISIBILITY_KEY) !== 'false';
  } catch {
    return true;
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

async function setSearchVisible(visible: boolean): Promise<void> {
  searchVisible.value = visible;
  if (!visible) query.value = '';
  if (storageAvailable()) {
    try {
      if (visible) localStorage.removeItem(SEARCH_VISIBILITY_KEY);
      else localStorage.setItem(SEARCH_VISIBILITY_KEY, 'false');
    } catch {
      // 本地偏好不可用时仅保留当前页面状态。
    }
  }
  await nextTick();
  updateActiveCategory();
}

function handleSidebarLeave(): void {
  if (sidebarPinned.value) return;
  sidebarHovered.value = false;
}

watch(toolGroups, async (groups) => {
  await nextTick();
  if (groups.length && !groups.some((group) => group.category.id === activeCategory.value)) {
    activeCategory.value = groups[0].category.id;
  }
  updateActiveCategory();
});

onMounted(async () => {
  void refreshLinks();
  catalogElement.value?.addEventListener('scroll', updateActiveCategory, { passive: true });
  const categoryId = route.hash.replace(/^#/, '');
  if (toolCategories.some((category) => category.id === categoryId)) {
    await scrollToCategory(categoryId, 'auto');
  } else {
    updateActiveCategory();
  }
});

onBeforeUnmount(() => {
  catalogElement.value?.removeEventListener('scroll', updateActiveCategory);
});
</script>

<template>
  <section
    class="tools-page tools-home"
    :class="{
      'tools-home--sidebar-pinned': sidebarPinned,
      'tools-home--sidebar-right': sidebarSide === 'right',
    }"
  >
    <ToolSidebar
      :categories="toolCategories"
      :active-category="activeCategory"
      :visible="sidebarVisible"
      :pinned="sidebarPinned"
      :side="sidebarSide"
      :search-visible="searchVisible"
      @enter="sidebarHovered = true"
      @leave="handleSidebarLeave"
      @select="scrollToCategory"
      @update:pinned="setSidebarPinned"
      @update:side="setSidebarSide"
      @update:search-visible="setSearchVisible"
    />

    <div
      ref="catalogElement"
      class="tools-catalog"
      :class="{ 'tools-catalog--without-search': !searchVisible }"
    >
      <div v-if="searchVisible" class="tools-toolbar">
        <ToolSearch v-model="query" />
      </div>

      <section
        v-if="favoriteTools.length"
        class="tools-favorites"
        aria-labelledby="tools-favorites-title"
      >
        <header class="tools-favorites__marker">
          <span><IconStarFilled :size="16" aria-hidden="true" /></span>
          <strong id="tools-favorites-title">我的收藏</strong>
        </header>
        <div class="tools-grid">
          <ToolCard
            v-for="tool in favoriteTools"
            :key="tool.id"
            :tool="tool"
            :favorite="true"
            @toggle-favorite="toggleFavorite"
          />
        </div>
      </section>

      <div v-if="toolGroups.length" class="tools-category-sections" aria-live="polite">
        <section
          v-for="group in toolGroups"
          :id="`tools-category-${group.category.id}`"
          :key="group.category.id"
          class="tools-category-section"
          :data-category="group.category.id"
          :style="{ '--tool-accent': group.category.color }"
          :aria-labelledby="`tools-category-title-${group.category.id}`"
        >
          <header class="tools-category-marker">
            <span><ToolIcon :icon="group.category.icon" :size="19" /></span>
            <div>
              <strong :id="`tools-category-title-${group.category.id}`">
                {{ group.category.name }}
              </strong>
              <small>{{ group.category.label }}</small>
            </div>
          </header>
          <div class="tools-grid">
            <ToolCard
              v-for="tool in group.tools"
              :key="tool.id"
              :tool="tool"
              :favorite="isFavorite(tool.id)"
              @toggle-favorite="toggleFavorite"
            />
          </div>
        </section>
      </div>

      <div v-else class="tools-empty">
        <strong>没有找到匹配的工具</strong>
        <p>尝试输入其他名称或描述。</p>
      </div>
    </div>
  </section>
</template>
