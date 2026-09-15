<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IconAi, IconBookmark, IconStarFilled } from '@tabler/icons-vue';
import BookmarkCard from '@/features/tools/components/BookmarkCard.vue';
import ToolCard from '@/features/tools/components/ToolCard.vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import ToolSearch from '@/features/tools/components/ToolSearch.vue';
import ToolSidebar from '@/features/tools/components/ToolSidebar.vue';
import ToolsBackgroundShortcut from '@/features/tools/components/ToolsBackgroundShortcut.vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import { useToolCatalog } from '@/features/tools/composables/useToolCatalog';
import { useToolFavorites } from '@/features/tools/composables/useToolFavorites';
import { useToolsCelebration } from '@/features/tools/composables/useToolsCelebration';
import { useToolsPreferences } from '@/features/tools/composables/useToolsPreferences';
import { searchTools, toolCategories } from '@/features/tools/tools';
import '@/features/tools/tools.css';

const route = useRoute();
const query = ref('');
const activeCategory = ref<string>(toolCategories[0]?.id ?? '');
const catalogElement = ref<HTMLElement | null>(null);
const carnivalFxElement = ref<HTMLCanvasElement | null>(null);
const sidebarHovered = ref(false);
const navigationTarget = ref<string | null>(null);
let navigationTargetTimer: ReturnType<typeof setTimeout> | undefined;
const SIDEBAR_PIN_KEY = `${STORAGE_POLICY.preferences}:tools-sidebar-pinned`;
const SIDEBAR_SIDE_KEY = `${STORAGE_POLICY.preferences}:tools-sidebar-side`;
const sidebarPinned = ref(readSidebarPinned());
const sidebarSide = ref(readSidebarSide());
const { searchVisible } = useToolsPreferences();
const { tools, aiSites, bookmarks, refreshLinks } = useToolCatalog();
const { favoriteIds, isFavorite, toggleFavorite } = useToolFavorites();
const { celebrationBurst, celebrationLevel, triggerCelebration } = useToolsCelebration(
  carnivalFxElement,
  catalogElement,
);
const celebrationStyle = computed<Record<string, string>>(() => {
  if (celebrationLevel.value === 0) return {} as Record<string, string>;
  const distance = 0.35 + celebrationLevel.value * 0.16;
  const verticalDistance = distance * 0.42;
  const rotation = 0.03 + celebrationLevel.value * 0.028;
  const duration = Math.max(460, 780 - celebrationLevel.value * 40);
  return {
    '--tools-card-shake-duration': `${duration}ms`,
    '--tools-card-shake-negative-rotation': `-${rotation.toFixed(3)}deg`,
    '--tools-card-shake-negative-x': `-${distance.toFixed(2)}px`,
    '--tools-card-shake-negative-y': `-${verticalDistance.toFixed(2)}px`,
    '--tools-card-shake-positive-rotation': `${rotation.toFixed(3)}deg`,
    '--tools-card-shake-positive-x': `${distance.toFixed(2)}px`,
    '--tools-card-shake-positive-y': `${verticalDistance.toFixed(2)}px`,
  };
});
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
  if (navigationTarget.value) {
    activeCategory.value = navigationTarget.value;
    return;
  }

  const catalogTop = catalogElement.value?.getBoundingClientRect().top ?? 0;
  const anchorTop = catalogTop + 12;
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-tools-navigation]'));
  let current = sections[0]?.dataset.toolsNavigation;

  for (const section of sections) {
    if (section.getBoundingClientRect().top > anchorTop) break;
    current = section.dataset.toolsNavigation;
  }

  if (current) {
    activeCategory.value = current;
    const nextHash = `#${current}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(window.history.state, '', nextHash);
    }
  }
}

function setNavigationTarget(target: string): void {
  navigationTarget.value = target;
  activeCategory.value = target;
  window.history.replaceState(window.history.state, '', `#${target}`);
  clearTimeout(navigationTargetTimer);
  navigationTargetTimer = setTimeout(() => {
    navigationTarget.value = null;
    updateActiveCategory();
  }, 700);
}

async function scrollToBookmarks(behavior: ScrollBehavior = 'smooth') {
  if (query.value) query.value = '';
  await nextTick();

  const section = document.getElementById('tools-bookmarks');
  if (!section) return;

  setNavigationTarget('bookmarks');
  section.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });

  if (!sidebarPinned.value) {
    sidebarHovered.value = false;
  }
}

async function scrollToAi(behavior: ScrollBehavior = 'smooth') {
  if (query.value) query.value = '';
  await nextTick();

  const section = document.getElementById('tools-ai');
  if (!section) return;

  setNavigationTarget('ai');
  section.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });

  if (!sidebarPinned.value) {
    sidebarHovered.value = false;
  }
}

async function scrollToFavorites(behavior: ScrollBehavior = 'smooth') {
  if (query.value) query.value = '';
  await nextTick();

  const section = document.getElementById('tools-favorites');
  if (!section) return;

  setNavigationTarget('favorites');
  section.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });

  if (!sidebarPinned.value) {
    sidebarHovered.value = false;
  }
}

async function scrollToCategory(categoryId: string, behavior: ScrollBehavior = 'smooth') {
  if (query.value) query.value = '';
  await nextTick();

  const section = document.getElementById(`tools-category-${categoryId}`);
  if (!section) return;

  setNavigationTarget(categoryId);
  section.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });

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
  if (sidebarPinned.value) return;
  sidebarHovered.value = false;
}

watch(toolGroups, async (groups) => {
  await nextTick();
  if (
    groups.length &&
    activeCategory.value !== 'favorites' &&
    activeCategory.value !== 'ai' &&
    activeCategory.value !== 'bookmarks' &&
    !groups.some((group) => group.category.id === activeCategory.value)
  ) {
    activeCategory.value = groups[0].category.id;
  }
  updateActiveCategory();
});

watch(favoriteTools, async (favorites) => {
  if (favorites.length || activeCategory.value !== 'favorites') return;
  navigationTarget.value = null;
  clearTimeout(navigationTargetTimer);
  await nextTick();
  updateActiveCategory();
});

watch(searchVisible, async (visible) => {
  if (!visible) query.value = '';
  await nextTick();
  updateActiveCategory();
});

onMounted(async () => {
  catalogElement.value?.addEventListener('scroll', updateActiveCategory, { passive: true });
  await refreshLinks();
  const categoryId = route.hash.replace(/^#/, '');
  if (categoryId === 'favorites' && favoriteTools.value.length) {
    await scrollToFavorites('auto');
  } else if (categoryId === 'ai' && aiSites.value.length) {
    await scrollToAi('auto');
  } else if (categoryId === 'bookmarks' && bookmarks.value.length) {
    await scrollToBookmarks('auto');
  } else if (toolCategories.some((category) => category.id === categoryId)) {
    await scrollToCategory(categoryId, 'auto');
  } else {
    updateActiveCategory();
  }
});

onBeforeUnmount(() => {
  clearTimeout(navigationTargetTimer);
  catalogElement.value?.removeEventListener('scroll', updateActiveCategory);
});
</script>

<template>
  <section
    class="tools-page tools-home"
    :class="{
      'tools-home--sidebar-pinned': sidebarPinned,
      'tools-home--sidebar-right': sidebarSide === 'right',
      'tools-home--celebrating': celebrationLevel > 0,
    }"
    :style="celebrationStyle"
  >
    <ToolSidebar
      :categories="toolCategories"
      :active-category="activeCategory"
      :visible="sidebarVisible"
      :pinned="sidebarPinned"
      :side="sidebarSide"
      :favorites-visible="favoriteTools.length > 0"
      :ai-visible="aiSites.length > 0"
      :bookmarks-visible="bookmarks.length > 0"
      :carnival-button="true"
      :carnival-burst="celebrationBurst"
      @enter="sidebarHovered = true"
      @leave="handleSidebarLeave"
      @select="scrollToCategory"
      @select-favorites="scrollToFavorites"
      @select-ai="scrollToAi"
      @select-bookmarks="scrollToBookmarks"
      @carnival="triggerCelebration"
      @update:pinned="setSidebarPinned"
      @update:side="setSidebarSide"
    />

    <ToolsBackgroundShortcut />

    <canvas ref="carnivalFxElement" class="tools-carnival__fx" aria-hidden="true"></canvas>

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
        id="tools-favorites"
        class="tools-favorites"
        data-tools-navigation="favorites"
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
          :data-tools-navigation="group.category.id"
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

        <section
          v-if="bookmarks.length && !query"
          id="tools-bookmarks"
          class="tools-bookmarks"
          data-tools-navigation="bookmarks"
          aria-labelledby="tools-bookmarks-title"
        >
          <header class="tools-link-section__marker">
            <span><IconBookmark :size="17" aria-hidden="true" /></span>
            <div>
              <strong id="tools-bookmarks-title">Bookmarks</strong>
              <small>收藏夹</small>
            </div>
          </header>
          <div class="tools-grid">
            <BookmarkCard v-for="bookmark in bookmarks" :key="bookmark.id" :bookmark="bookmark" />
          </div>
        </section>

        <section
          v-if="aiSites.length && !query"
          id="tools-ai"
          class="tools-ai"
          data-tools-navigation="ai"
          aria-labelledby="tools-ai-title"
        >
          <header class="tools-link-section__marker">
            <span><IconAi :size="17" aria-hidden="true" /></span>
            <div>
              <strong id="tools-ai-title">AI</strong>
            </div>
          </header>
          <div class="tools-grid">
            <BookmarkCard v-for="site in aiSites" :key="site.id" :bookmark="site" />
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
