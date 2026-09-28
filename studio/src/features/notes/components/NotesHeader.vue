<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  IconArrowsMaximize,
  IconCircleChevronUp,
  IconCircleChevronDown,
  IconConfetti,
  IconDots,
  IconFilePlus,
  IconMoon,
  IconSun,
  IconTrash,
} from '@tabler/icons-vue';
import StudioLogo from '@/components/StudioLogo.vue';

const dataMenu = ref<HTMLDetailsElement | null>(null);

function closeDataMenu(): void {
  if (dataMenu.value) dataMenu.value.open = false;
}

function requestExport(): void {
  closeDataMenu();
  emit('export-backup');
}

function requestImport(): void {
  closeDataMenu();
  emit('import-backup');
}

function requestClear(): void {
  closeDataMenu();
  emit('clear');
}

defineProps<{
  headerVisible: boolean;
  allCollapsed: boolean;
  carnivalLevel: number;
  resolvedTheme: 'light' | 'dark';
}>();

const emit = defineEmits<{
  (e: 'toggle-header'): void;
  (e: 'create'): void;
  (e: 'toggle-all'): void;
  (e: 'arrange'): void;
  (e: 'carnival'): void;
  (e: 'export-backup'): void;
  (e: 'import-backup'): void;
  (e: 'clear'): void;
  (e: 'toggle-theme'): void;
}>();
</script>

<template>
  <header v-show="headerVisible" class="notes-editor__header">
    <div class="notes-editor__header-start">
      <RouterLink class="notes-editor__home" to="/" aria-label="返回 Studio">
        <StudioLogo />
      </RouterLink>
      <strong class="notes-editor__name">便签</strong>
    </div>

    <div class="notes-editor__actions" aria-label="便签操作">
      <button
        class="note-action"
        type="button"
        aria-label="新建便签"
        data-tooltip="新建便签"
        @click="emit('create')"
      >
        <IconFilePlus :size="18" />
      </button>
      <button
        class="note-action"
        type="button"
        :aria-label="allCollapsed ? '全部展开' : '全部折叠'"
        :data-tooltip="allCollapsed ? '全部展开' : '全部折叠'"
        @click="emit('toggle-all')"
      >
        <IconCircleChevronDown v-if="allCollapsed" :size="18" />
        <IconCircleChevronUp v-else :size="18" />
      </button>
      <button
        class="note-action"
        type="button"
        aria-label="整理画布"
        data-tooltip="整理画布"
        @click="emit('arrange')"
      >
        <IconArrowsMaximize :size="18" />
      </button>
      <button
        class="note-action"
        :class="{ 'note-action--carnival': carnivalLevel > 0 }"
        type="button"
        aria-label="狂欢"
        data-tooltip="狂欢"
        @click="emit('carnival')"
      >
        <IconConfetti :key="carnivalLevel" :size="18" />
      </button>
      <span class="notes-editor__separator" aria-hidden="true"></span>
      <details ref="dataMenu" class="notes-editor__data-menu" @keydown.esc="closeDataMenu">
        <summary class="note-action" aria-label="备份与清理" data-tooltip="备份与清理">
          <IconDots :size="18" />
        </summary>
        <div class="notes-editor__data-actions">
          <button type="button" @click="requestExport">导出备份</button>
          <button type="button" @click="requestImport">导入备份（合并）</button>
          <button class="note-action--danger" type="button" @click="requestClear">
            <IconTrash :size="16" />清空全部便签
          </button>
        </div>
      </details>
      <button
        class="note-action"
        type="button"
        :aria-label="resolvedTheme === 'dark' ? '切换浅色主题' : '切换深色主题'"
        :data-tooltip="resolvedTheme === 'dark' ? '浅色主题' : '深色主题'"
        @click="emit('toggle-theme')"
      >
        <IconSun v-if="resolvedTheme === 'dark'" :size="18" />
        <IconMoon v-else :size="18" />
      </button>
    </div>
  </header>

  <studio-header-toggle :visible="headerVisible" @click="emit('toggle-header')" />
</template>
