<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watchEffect } from "vue";
import ActivityBar from "@/components/layout/ActivityBar.vue";
import AppHeader from "@/components/layout/AppHeader.vue";
import StatusBar from "@/components/layout/StatusBar.vue";
import WorkspaceResizer from "@/components/layout/WorkspaceResizer.vue";
import FileExplorer from "@/components/explorer/FileExplorer.vue";
import EditorPane from "@/components/editor/EditorPane.vue";
import PreviewPane from "@/components/preview/PreviewPane.vue";
import ToastRegion from "@/components/feedback/ToastRegion.vue";
import DonationDialog from "@/components/feedback/DonationDialog.vue";
import SettingsDialog from "@/components/settings/SettingsDialog.vue";
import AssetsPanel from "@/components/sidebar/AssetsPanel.vue";
import GraphPanel from "@/components/sidebar/GraphPanel.vue";
import SearchPanel from "@/components/sidebar/SearchPanel.vue";
import TagsPanel from "@/components/sidebar/TagsPanel.vue";
import WelcomeView from "@/components/welcome/WelcomeView.vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();

const activeSidebar = computed(() => {
  if (store.activePanel === "search") {
    return SearchPanel;
  }
  if (store.activePanel === "tags") {
    return TagsPanel;
  }
  if (store.activePanel === "assets") {
    return AssetsPanel;
  }
  if (store.activePanel === "graph") {
    return GraphPanel;
  }
  return FileExplorer;
});

function focusWorkspaceSearch(): void {
  store.showPanel("search");
  globalThis.setTimeout(() => {
    document
      .querySelector<HTMLInputElement>(
        '.search-panel__form input[type="search"]',
      )
      ?.focus();
  });
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  if (
    event.key === "Escape" &&
    store.fullscreenPane &&
    !store.settingsOpen &&
    !store.donationOpen
  ) {
    event.preventDefault();
    store.fullscreenPane = null;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
    return;
  }

  const primary = event.metaKey || event.ctrlKey;
  if (!primary) {
    return;
  }

  const key = event.key.toLocaleLowerCase();
  if (key === "s") {
    event.preventDefault();
    void store.saveActiveDocument();
    return;
  }

  if ((key === "f" && event.shiftKey) || key === "k") {
    event.preventDefault();
    focusWorkspaceSearch();
  }
}

function handleFullscreenChange(): void {
  if (!document.fullscreenElement) {
    store.fullscreenPane = null;
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (
    store.activePath &&
    store.activeContent !== store.activeDocument?.content
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
}

watchEffect(() => {
  document.documentElement.style.setProperty(
    "--sidebar-width",
    `${store.preferences.sidebarWidth}px`,
  );
  document.documentElement.style.setProperty(
    "--editor-width",
    `${store.preferences.editorWidth}px`,
  );
  if (!store.preferences.previewEnabled && store.mobileView === "preview") {
    store.mobileView = "editor";
  }
});

onMounted(() => {
  void store.initialize();
  document.addEventListener("keydown", handleKeyboardShortcut);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  globalThis.addEventListener("beforeunload", handleBeforeUnload);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeyboardShortcut);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  globalThis.removeEventListener("beforeunload", handleBeforeUnload);
  store.dispose();
});
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>

  <div
    class="app-shell"
    :class="{ 'app-shell--welcome': !store.hasWorkspace }"
  >
    <AppHeader />

    <WelcomeView v-if="!store.hasWorkspace" />

    <main
      v-else
      id="main-content"
      class="workspace-shell"
      :class="{
        'workspace-shell--sidebar-hidden': !store.sidebarOpen,
        'workspace-shell--sidebar-compact':
          store.sidebarOpen && store.preferences.sidebarWidth <= 220,
        'workspace-shell--preview-hidden': !store.preferences.previewEnabled,
        'workspace-shell--fullscreen-editor': store.fullscreenPane === 'editor',
        'workspace-shell--fullscreen-preview': store.fullscreenPane === 'preview',
        'workspace-shell--fullscreen-workspace': store.fullscreenPane === 'workspace',
      }"
      :data-mobile-view="store.mobileView"
    >
      <ActivityBar />
      <aside class="sidebar" aria-label="工作空间侧栏">
        <component :is="activeSidebar" />
      </aside>
      <WorkspaceResizer target="sidebarWidth" label="调整左侧侧栏宽度" />
      <EditorPane />
      <WorkspaceResizer
        v-if="store.preferences.previewEnabled"
        target="editorWidth"
        label="调整编辑器和预览区域宽度"
      />
      <PreviewPane v-if="store.preferences.previewEnabled" />

      <nav class="mobile-view-switch" aria-label="编辑和预览视图">
        <button
          type="button"
          :class="{ 'mobile-view-switch__active': store.mobileView === 'editor' }"
          @click="store.mobileView = 'editor'"
        >
          编辑
        </button>
        <button
          type="button"
          :class="{ 'mobile-view-switch__active': store.mobileView === 'preview' }"
          :disabled="!store.preferences.previewEnabled"
          @click="store.mobileView = 'preview'"
        >
          预览
        </button>
      </nav>
    </main>

    <StatusBar v-if="store.hasWorkspace" />
  </div>

  <SettingsDialog />
  <DonationDialog />
  <ToastRegion />
</template>
