<script setup lang="ts">
import { IconPinFilled, IconSearch, IconX } from '@tabler/icons-vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import { toolCategories } from '@/features/tools/config/toolCategories';

defineProps<{
  activeCategory: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <aside
    id="tool-detail-categories"
    class="tool-detail-sidebar"
    :class="{ 'is-open': open }"
    aria-label="工具分类"
  >
    <div class="tool-detail-sidebar__topbar">
      <span>工具分类</span>
      <IconPinFilled class="tool-detail-sidebar__pin" :size="17" aria-hidden="true" />
      <button type="button" class="tool-detail-sidebar__close" aria-label="关闭工具分类" @click="emit('close')">
        <IconX :size="19" aria-hidden="true" />
      </button>
    </div>

    <nav>
      <RouterLink
        v-for="category in toolCategories"
        :key="category.id"
        :to="`/tools#${category.id}`"
        :class="{ 'is-active': category.id === activeCategory }"
        :style="{ '--tool-accent': category.accent }"
        :aria-current="category.id === activeCategory ? 'page' : undefined"
        @click="emit('close')"
      >
        <ToolIcon :name="category.icon" :size="20" />
        <span>
          <strong>{{ category.name }}</strong>
          <small>{{ category.label }}</small>
        </span>
      </RouterLink>
    </nav>

    <div class="tool-detail-sidebar__footer">
      <ThemeToggle :size="17" />
      <RouterLink to="/tools" aria-label="返回工具搜索" title="返回工具搜索">
        <IconSearch :size="19" aria-hidden="true" />
      </RouterLink>
    </div>
  </aside>
</template>
