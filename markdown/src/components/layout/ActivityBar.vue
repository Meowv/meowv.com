<script setup lang="ts">
import {
  Files,
  HandCoins,
  Images,
  Network,
  Search,
  Settings,
  Tags,
} from "@lucide/vue";
import {
  useWorkspaceStore,
  type WorkspacePanel,
} from "@/stores/workspace";

const store = useWorkspaceStore();

const activities: Array<{
  id: WorkspacePanel;
  label: string;
  icon: typeof Files;
}> = [
  { id: "explorer", label: "资源管理器", icon: Files },
  { id: "search", label: "全文搜索", icon: Search },
  { id: "tags", label: "标签", icon: Tags },
  { id: "assets", label: "图片资源", icon: Images },
  { id: "graph", label: "知识图谱", icon: Network },
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
          'activity-button--active':
            store.activePanel === activity.id && store.sidebarOpen,
        }"
        type="button"
        :aria-label="activity.label"
        :title="activity.label"
        @click="store.selectPanel(activity.id)"
      >
        <component :is="activity.icon" aria-hidden="true" />
      </button>
    </div>

    <div class="activity-bar__group">
      <button
        class="activity-button"
        type="button"
        aria-label="捐赠支持"
        title="捐赠支持"
        @click="store.donationOpen = true"
      >
        <HandCoins aria-hidden="true" />
      </button>
      <button
        class="activity-button"
        type="button"
        aria-label="设置"
        title="设置"
        @click="store.settingsOpen = true"
      >
        <Settings aria-hidden="true" />
      </button>
    </div>
  </nav>
</template>
