<script setup lang="ts">
import { computed } from 'vue';
import {
  IconAi,
  IconAdjustments,
  IconBookmark,
  IconConfetti,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRightCollapse,
  IconPin,
  IconPinFilled,
  IconStarFilled,
} from '@tabler/icons-vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { useToolsBackground } from '@/features/tools/composables/useToolsBackground';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import type { ToolCategoryConfig } from '@/features/tools/tools';

const props = withDefaults(
  defineProps<{
    id?: string;
    categories: ToolCategoryConfig[];
    activeCategory: string;
    visible: boolean;
    pinned: boolean;
    side: 'left' | 'right';
    favoritesVisible?: boolean;
    aiVisible?: boolean;
    bookmarksVisible?: boolean;
    carnivalButton?: boolean;
    carnivalBurst?: number;
  }>(),
  {
    aiVisible: false,
    bookmarksVisible: false,
    carnivalButton: false,
    carnivalBurst: 0,
    favoritesVisible: false,
  },
);

const emit = defineEmits<{
  select: [categoryId: string];
  'select-favorites': [];
  'select-ai': [];
  'select-bookmarks': [];
  carnival: [];
  enter: [];
  leave: [];
  'update:pinned': [value: boolean];
  'update:side': [value: 'left' | 'right'];
}>();

const { openSettings } = useToolsBackground();

const sidebarClass = computed(() => ({
  'tools-sidebar-dock--visible': props.visible,
  'tools-sidebar-dock--pinned': props.pinned,
  'tools-sidebar-dock--right': props.side === 'right',
}));
</script>

<template>
  <div
    :id="id"
    class="tools-sidebar-dock"
    :class="sidebarClass"
    @mouseenter="emit('enter')"
    @mouseleave="emit('leave')"
  >
    <aside class="tools-sidebar" aria-label="工具分类">
      <div class="tools-sidebar__topbar">
        <span>工具分类</span>
        <button
          class="tools-sidebar__pin"
          :class="{ 'is-active': pinned }"
          type="button"
          :aria-label="pinned ? '取消常驻显示' : '常驻显示分类栏'"
          :title="pinned ? '取消常驻显示' : '常驻显示分类栏'"
          :aria-pressed="pinned"
          @click="emit('update:pinned', !pinned)"
        >
          <IconPinFilled v-if="pinned" :size="16" aria-hidden="true" />
          <IconPin v-else :size="16" aria-hidden="true" />
        </button>
      </div>

      <nav>
        <button
          v-if="favoritesVisible"
          class="tools-sidebar__favorites"
          type="button"
          :class="{ 'is-active': activeCategory === 'favorites' }"
          :aria-current="activeCategory === 'favorites' ? 'true' : undefined"
          @click="emit('select-favorites')"
        >
          <IconStarFilled :size="18" aria-hidden="true" />
          <span>
            <strong>Favorites</strong>
            <small>我的收藏</small>
          </span>
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          :class="{ 'is-active': category.id === activeCategory }"
          :style="{ '--tool-accent': category.color }"
          :aria-current="category.id === activeCategory ? 'true' : undefined"
          @click="emit('select', category.id)"
        >
          <ToolIcon :icon="category.icon" :size="18" />
          <span>
            <strong>{{ category.name }}</strong>
            <small>{{ category.label }}</small>
          </span>
        </button>
        <button
          v-if="bookmarksVisible"
          class="tools-sidebar__bookmarks"
          type="button"
          :class="{ 'is-active': activeCategory === 'bookmarks' }"
          :aria-current="activeCategory === 'bookmarks' ? 'true' : undefined"
          @click="emit('select-bookmarks')"
        >
          <IconBookmark :size="18" aria-hidden="true" />
          <span>
            <strong>Bookmarks</strong>
            <small>收藏夹</small>
          </span>
        </button>
        <button
          v-if="aiVisible"
          class="tools-sidebar__ai"
          type="button"
          :class="{ 'is-active': activeCategory === 'ai' }"
          :aria-current="activeCategory === 'ai' ? 'true' : undefined"
          @click="emit('select-ai')"
        >
          <IconAi :size="18" aria-hidden="true" />
          <span>
            <strong>AI</strong>
          </span>
        </button>
      </nav>

      <div
        class="tools-sidebar__footer"
        :class="{ 'tools-sidebar__footer--carnival': carnivalButton }"
      >
        <ThemeToggle :size="16" />
        <button
          class="tools-sidebar__setting tools-sidebar__setting--background"
          type="button"
          aria-label="工具设置"
          title="工具设置"
          @click="openSettings"
        >
          <IconAdjustments :size="17" aria-hidden="true" />
        </button>
        <button
          v-if="carnivalButton"
          class="tools-sidebar__setting tools-sidebar__setting--carnival"
          :class="{ 'is-active': carnivalBurst > 0, 'is-celebrating': carnivalBurst > 0 }"
          type="button"
          aria-label="狂欢"
          title="狂欢"
          @click="emit('carnival')"
        >
          <IconConfetti :key="carnivalBurst" :size="17" aria-hidden="true" />
        </button>
        <button
          class="tools-sidebar__setting tools-sidebar__setting--dock"
          type="button"
          :aria-label="side === 'left' ? '靠右停靠工具分类' : '靠左停靠工具分类'"
          :title="side === 'left' ? '靠右停靠' : '靠左停靠'"
          @click="emit('update:side', side === 'left' ? 'right' : 'left')"
        >
          <IconLayoutSidebarRightCollapse v-if="side === 'left'" :size="17" aria-hidden="true" />
          <IconLayoutSidebarLeftCollapse v-else :size="17" aria-hidden="true" />
        </button>
      </div>
    </aside>
  </div>
</template>
