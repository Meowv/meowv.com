<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  Check,
  ChevronDown,
  FileText,
  FolderInput,
  History,
  LoaderCircle,
  LogOut,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
} from "@lucide/vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
const workspaceMenuOpen = ref(false);
const workspaceHistoryOpen = ref(false);
const switchableWorkspaceHistory = computed(() =>
  store.isDemo ? store.workspaceHistory : store.workspaceHistory.slice(1),
);

const statusText = computed(() => {
  if (store.saveState === "saving") {
    return "保存中…";
  }
  if (store.saveState === "dirty") {
    return "有未保存更改";
  }
  if (store.saveState === "error") {
    return "保存失败";
  }
  return store.isDemo ? "示例模式" : "已保存";
});

const statusClass = computed(() => ({
  "topbar__status--saved": store.saveState === "saved",
  "topbar__status--saving": store.saveState === "saving",
  "topbar__status--dirty":
    store.saveState === "dirty" || store.saveState === "error",
}));

function toggleTheme(): void {
  void store.updatePreferences({
    theme: store.resolvedTheme === "light" ? "dark" : "light",
  });
}

async function refreshWorkspace(): Promise<void> {
  workspaceMenuOpen.value = false;
  await store.refreshWorkspace({ feedback: true });
}

async function openAnotherWorkspace(): Promise<void> {
  workspaceMenuOpen.value = false;
  workspaceHistoryOpen.value = false;
  await store.openLocalWorkspace();
}

async function openWorkspaceHistory(id: string): Promise<void> {
  workspaceMenuOpen.value = false;
  workspaceHistoryOpen.value = false;
  await store.openWorkspaceHistory(id);
}

async function closeWorkspace(): Promise<void> {
  workspaceMenuOpen.value = false;
  workspaceHistoryOpen.value = false;
  await store.closeWorkspace();
}

function closeWorkspaceMenu(): void {
  workspaceMenuOpen.value = false;
  workspaceHistoryOpen.value = false;
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    workspaceMenuOpen.value = false;
    workspaceHistoryOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", closeWorkspaceMenu);
  document.addEventListener("keydown", handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeWorkspaceMenu);
  document.removeEventListener("keydown", handleDocumentKeydown);
});
</script>

<template>
  <header class="topbar">
    <div class="topbar__brand">
      <span class="app-logo" aria-hidden="true">
        <FileText />
      </span>
      <span class="topbar__product">Markdown Studio</span>

      <template v-if="store.hasWorkspace">
        <span class="topbar__divider" aria-hidden="true" />
        <div class="topbar__workspace-wrap" @click.stop>
          <button
            class="topbar__workspace"
            type="button"
            :aria-expanded="workspaceMenuOpen"
            aria-haspopup="menu"
            @click="workspaceMenuOpen = !workspaceMenuOpen"
          >
            <span class="topbar__workspace-name">{{
              store.workspaceName
            }}</span>
            <ChevronDown :size="15" aria-hidden="true" />
          </button>

          <div
            v-if="workspaceMenuOpen"
            class="context-menu topbar__workspace-menu"
            role="menu"
          >
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              :disabled="store.refreshing"
              @click="refreshWorkspace"
            >
              <RefreshCw
                :size="16"
                :class="{ 'animate-spin': store.refreshing }"
                aria-hidden="true"
              />
              刷新工作空间
            </button>
            <div class="context-menu__workspace-switch">
              <button
                class="context-menu__item"
                type="button"
                role="menuitem"
                @click="openAnotherWorkspace"
              >
                <FolderInput :size="16" aria-hidden="true" />
                切换工作空间
              </button>
              <div class="context-menu__history-wrap">
                <button
                  class="icon-button context-menu__history-button"
                  type="button"
                  title="打开工作空间历史"
                  aria-label="打开工作空间历史"
                  :aria-expanded="workspaceHistoryOpen"
                  aria-haspopup="menu"
                  :disabled="!switchableWorkspaceHistory.length"
                  @click="workspaceHistoryOpen = !workspaceHistoryOpen"
                >
                  <History :size="16" aria-hidden="true" />
                </button>

                <div
                  v-if="workspaceHistoryOpen"
                  class="context-menu context-menu--workspace-history"
                  role="menu"
                  aria-label="工作空间历史"
                >
                  <p class="context-menu__label">最近打开</p>
                  <button
                    v-for="entry in switchableWorkspaceHistory"
                    :key="entry.id"
                    class="context-menu__item context-menu__history-item"
                    type="button"
                    role="menuitem"
                    :disabled="store.busy"
                    @click="openWorkspaceHistory(entry.id)"
                  >
                    <FolderInput :size="16" aria-hidden="true" />
                    <span>{{ entry.name }}</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="context-menu__separator" />
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              @click="closeWorkspace"
            >
              <LogOut :size="16" aria-hidden="true" />
              关闭工作空间
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="topbar__spacer" aria-hidden="true" />

    <div class="topbar__actions">
      <div
        v-if="store.hasWorkspace"
        class="topbar__status"
        :class="statusClass"
        aria-live="polite"
      >
        <LoaderCircle
          v-if="store.saveState === 'saving'"
          :size="16"
          class="animate-spin"
          aria-hidden="true"
        />
        <Check
          v-else-if="store.saveState === 'saved'"
          :size="16"
          aria-hidden="true"
        />
        <ShieldCheck v-else :size="16" aria-hidden="true" />
        <span>{{ statusText }}</span>
      </div>

      <button
        class="icon-button"
        type="button"
        :aria-label="
          store.resolvedTheme === 'light' ? '切换到深色主题' : '切换到浅色主题'
        "
        @click="toggleTheme"
      >
        <Moon v-if="store.resolvedTheme === 'light'" />
        <Sun v-else />
      </button>
    </div>

    <button
      v-if="!store.hasWorkspace && store.recentDirectory"
      class="topbar__reopen-workspace"
      type="button"
      :aria-label="`重新打开 ${store.recentDirectory.name}`"
      :disabled="store.busy"
      @click="store.reopenRecentWorkspace"
    >
      <History :size="16" aria-hidden="true" />
      <span>重新打开 {{ store.recentDirectory.name }}</span>
    </button>
  </header>
</template>
