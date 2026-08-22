<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watchEffect } from 'vue';
import ActivityBar from '@/features/markdown/components/layout/ActivityBar.vue';
import StatusBar from '@/features/markdown/components/layout/StatusBar.vue';
import WorkspaceResizer from '@/features/markdown/components/layout/WorkspaceResizer.vue';
import FileExplorer from '@/features/markdown/components/explorer/FileExplorer.vue';
import EditorPane from '@/features/markdown/components/editor/EditorPane.vue';
import PreviewPane from '@/features/markdown/components/preview/PreviewPane.vue';
import ToastRegion from '@/features/markdown/components/feedback/ToastRegion.vue';
import AssetsPanel from '@/features/markdown/components/sidebar/AssetsPanel.vue';
import GraphPanel from '@/features/markdown/components/sidebar/GraphPanel.vue';
import SearchPanel from '@/features/markdown/components/sidebar/SearchPanel.vue';
import TagsPanel from '@/features/markdown/components/sidebar/TagsPanel.vue';
import { useWorkspaceStore } from '@/features/markdown/stores/workspace';
import { useFileHandoff } from '@/core/browser/file-handoff';
import { markdownFullscreenActive } from '@/core/shared/route-state';

const store = useWorkspaceStore();
const { take: takeHandoffFile } = useFileHandoff();

const activeSidebar = computed(() => {
  if (store.activePanel === 'search') {
    return SearchPanel;
  }
  if (store.activePanel === 'tags') {
    return TagsPanel;
  }
  if (store.activePanel === 'assets') {
    return AssetsPanel;
  }
  if (store.activePanel === 'graph') {
    return GraphPanel;
  }
  return FileExplorer;
});

function focusWorkspaceSearch(): void {
  store.showPanel('search');
  globalThis.setTimeout(() => {
    document.querySelector<HTMLInputElement>('.search-panel__form input[type="search"]')?.focus();
  });
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  if (event.key === 'Escape' && store.fullscreenPane) {
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
  const target = event.target;
  const isTextEditing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable);
  if (key === 'z' && !event.shiftKey && !isTextEditing && store.canUndoMove) {
    event.preventDefault();
    void store.undoLastMove();
    return;
  }
  if (key === 's') {
    event.preventDefault();
    void store.saveActiveDocument();
    return;
  }

  if ((key === 'f' && event.shiftKey) || key === 'k') {
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
  if (store.hasEditableDocument && store.saveState === 'dirty') {
    event.preventDefault();
    event.returnValue = '';
  }
}

watchEffect(() => {
  markdownFullscreenActive.value = store.fullscreenPane !== null;
  document.documentElement.style.setProperty(
    '--markdown-sidebar-width',
    `${store.preferences.sidebarWidth}px`,
  );
  document.documentElement.style.setProperty(
    '--markdown-editor-width',
    `${store.preferences.editorWidth}px`,
  );
  if (store.isPlainTextDocument) {
    store.mobileView = 'editor';
  } else if (!store.preferences.editorVisible || store.isActiveDocumentLocked) {
    store.mobileView = 'preview';
  } else if (!store.preferences.previewEnabled && store.mobileView === 'preview') {
    store.mobileView = 'editor';
  }
});

onMounted(async () => {
  const handoffFile = takeHandoffFile('markdown');
  await store.initialize();
  if (handoffFile) {
    await store.loadStandaloneFile(handoffFile);
  }
  document.addEventListener('keydown', handleKeyboardShortcut);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  globalThis.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
  markdownFullscreenActive.value = false;
  document.removeEventListener('keydown', handleKeyboardShortcut);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  globalThis.removeEventListener('beforeunload', handleBeforeUnload);
  store.dispose();
});
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>

  <div class="app-shell">
    <main
      v-if="store.hasWorkspace"
      id="main-content"
      class="workspace-shell"
      :class="{
        'workspace-shell--sidebar-hidden': !store.sidebarOpen,
        'workspace-shell--sidebar-compact':
          store.sidebarOpen && store.preferences.sidebarWidth <= 220,
        'workspace-shell--preview-hidden':
          !store.preferences.previewEnabled || store.isPlainTextDocument,
        'workspace-shell--plain-text': store.isPlainTextDocument,
        'workspace-shell--editor-hidden':
          (!store.preferences.editorVisible && !store.isPlainTextDocument) ||
          (store.isActiveDocumentLocked && !store.isPlainTextDocument),
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
        v-if="
          store.preferences.previewEnabled &&
          !store.isPlainTextDocument &&
          store.preferences.editorVisible &&
          !store.isActiveDocumentLocked
        "
        target="editorWidth"
        label="调整编辑器和预览区域宽度"
      />
      <PreviewPane v-if="store.preferences.previewEnabled && !store.isPlainTextDocument" />

      <nav
        v-if="
          store.preferences.editorVisible &&
          !store.isActiveDocumentLocked &&
          !store.isPlainTextDocument
        "
        class="mobile-view-switch"
        aria-label="编辑和预览视图"
      >
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

  <ToastRegion />
</template>
