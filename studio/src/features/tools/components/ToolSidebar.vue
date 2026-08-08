<script setup lang="ts">
import { computed } from 'vue';
import {
  IconChevronLeft,
  IconChevronRight,
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
  searchVisible: boolean;
}>();

const emit = defineEmits<{
  select: [categoryId: string];
  enter: [];
  leave: [];
  scroll: [deltaY: number];
  toggle: [];
  'update:pinned': [value: boolean];
  'update:searchVisible': [value: boolean];
}>();

const sidebarClass = computed(() => ({
  'tools-sidebar-dock--visible': props.visible,
  'tools-sidebar-dock--pinned': props.pinned,
}));
</script>

<template>
  <div
    class="tools-sidebar-dock"
    :class="sidebarClass"
    @mouseenter="emit('enter')"
    @mouseleave="emit('leave')"
    @wheel.prevent="emit('scroll', $event.deltaY)"
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
          class="tools-sidebar__setting"
          type="button"
          :aria-label="searchVisible ? '隐藏搜索框' : '显示搜索框'"
          :title="searchVisible ? '隐藏搜索框' : '显示搜索框'"
          :aria-pressed="searchVisible"
          @click="emit('update:searchVisible', !searchVisible)"
        >
          <IconSearch :size="17" aria-hidden="true" />
        </button>
      </div>
    </aside>

    <button
      class="tools-sidebar-handle"
      type="button"
      :aria-label="visible ? '隐藏工具分类' : '显示工具分类'"
      :title="visible ? '隐藏工具分类' : '显示工具分类'"
      @click="emit('toggle')"
    >
      <IconChevronLeft v-if="visible" :size="16" aria-hidden="true" />
      <IconChevronRight v-else :size="16" aria-hidden="true" />
    </button>
  </div>
</template>
