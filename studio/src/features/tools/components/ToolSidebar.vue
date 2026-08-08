<script setup lang="ts">
import { computed } from 'vue';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRightCollapse,
  IconPin,
  IconPinFilled,
  IconSearch,
} from '@tabler/icons-vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import type { ToolCategoryConfig } from '@/features/tools/config/toolCategories';

const props = defineProps<{
  categories: ToolCategoryConfig[];
  activeCategory: string;
  visible: boolean;
  pinned: boolean;
  side: 'left' | 'right';
  searchVisible: boolean;
}>();

const emit = defineEmits<{
  select: [categoryId: string];
  enter: [];
  leave: [];
  'update:pinned': [value: boolean];
  'update:side': [value: 'left' | 'right'];
  'update:searchVisible': [value: boolean];
}>();

const sidebarClass = computed(() => ({
  'tools-sidebar-dock--visible': props.visible,
  'tools-sidebar-dock--pinned': props.pinned,
  'tools-sidebar-dock--right': props.side === 'right',
}));
</script>

<template>
  <div
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
          v-for="category in categories"
          :key="category.id"
          type="button"
          :class="{ 'is-active': category.id === activeCategory }"
          :style="{ '--tool-accent': category.accent }"
          :aria-current="category.id === activeCategory ? 'true' : undefined"
          @click="emit('select', category.id)"
        >
          <ToolIcon :name="category.icon" :size="18" />
          <span>
            <strong>{{ category.name }}</strong>
            <small>{{ category.label }}</small>
          </span>
        </button>
      </nav>

      <div class="tools-sidebar__footer">
        <ThemeToggle :size="16" />
        <button
          class="tools-sidebar__setting tools-sidebar__setting--search"
          type="button"
          :aria-label="searchVisible ? '隐藏搜索框' : '显示搜索框'"
          :title="searchVisible ? '隐藏搜索框' : '显示搜索框'"
          :aria-pressed="searchVisible"
          @click="emit('update:searchVisible', !searchVisible)"
        >
          <IconSearch :size="17" aria-hidden="true" />
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
