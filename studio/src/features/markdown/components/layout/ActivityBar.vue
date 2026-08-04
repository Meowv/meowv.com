<script setup lang="ts">
import { Files, Images, Network, Search, Tags } from '@/features/markdown/icons';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { useWorkspaceStore, type WorkspacePanel } from '@/features/markdown/stores/workspace';

const store = useWorkspaceStore();

const activities: Array<{
  id: WorkspacePanel;
  label: string;
  icon: typeof Files;
}> = [
  { id: 'explorer', label: '资源管理器', icon: Files },
  { id: 'search', label: '全文搜索', icon: Search },
  { id: 'tags', label: '标签', icon: Tags },
  { id: 'assets', label: '图片资源', icon: Images },
  { id: 'graph', label: '知识图谱', icon: Network },
];
</script>

<template>
  <nav class="activity-bar" aria-label="工作空间工具">
    <div class="activity-bar__group">
      <button
        v-for="activity in activities"
        :key="activity.id"
        class="activity-button"
        :class="{
          'activity-button--active': store.activePanel === activity.id && store.sidebarOpen,
        }"
        type="button"
        :aria-label="activity.label"
        :title="activity.label"
        @click="store.selectPanel(activity.id)"
      >
        <component :is="activity.icon" aria-hidden="true" />
      </button>
    </div>
    <div class="activity-bar__group activity-bar__group--bottom">
      <ThemeToggle class="activity-button activity-button--theme" :size="21" />
    </div>
  </nav>
</template>
