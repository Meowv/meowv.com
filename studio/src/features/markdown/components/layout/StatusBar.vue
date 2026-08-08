<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  FileText,
  Folder,
  FolderInput,
  History,
  LockKeyhole,
  LockKeyholeOpen,
} from '@/features/markdown/icons';
import { useWorkspaceStore } from '@/features/markdown/stores/workspace';
import type { AutoSaveDelay, WorkspacePreferences } from '@/features/markdown/types/workspace';

type BooleanPreferenceKey = 'autoSaveEnabled' | 'wordWrap' | 'lineNumbers' | 'syncScroll';

const store = useWorkspaceStore();

const characterCount = ref(0);
let characterCountTimer: ReturnType<typeof setTimeout> | undefined;
let countedPath = '';

function updateCharacterCount(content: string, immediate = false): void {
  if (characterCountTimer) {
    clearTimeout(characterCountTimer);
  }
  const update = (): void => {
    characterCountTimer = undefined;
    characterCount.value = Array.from(content.replace(/\s/gu, '')).length;
  };
  if (immediate) {
    update();
    return;
  }
  characterCountTimer = globalThis.setTimeout(update, 180);
}

watch(
  () => [store.activePath, store.activeContent] as const,
  ([path, content]) => {
    const pathChanged = path !== countedPath;
    countedPath = path;
    updateCharacterCount(content, pathChanged);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (characterCountTimer) {
    clearTimeout(characterCountTimer);
  }
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
});

const documentPath = computed(() => store.activePath || '当前未打开 Markdown 文档');

const documentPathSegments = computed(() => documentPath.value.split('/'));

const lockLabel = computed(() => (store.isActiveDocumentLocked ? '解锁当前文档' : '锁定当前文档'));

const autosaveOptions: ReadonlyArray<{ value: AutoSaveDelay; label: string }> = [
  { value: 1000, label: '1 秒' },
  { value: 2000, label: '2 秒' },
  { value: 5000, label: '5 秒' },
];

const fontSizeOptions = [12, 13, 14, 15, 16, 18, 20, 24] as const;

function setBooleanPreference(key: BooleanPreferenceKey, event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked;
  void store.updatePreferences({ [key]: enabled } as Partial<WorkspacePreferences>);
}

function setAutosaveDelay(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  if (value === 1000 || value === 2000 || value === 5000) {
    void store.updatePreferences({ autoSaveDelay: value });
  }
}

function setEditorFontSize(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  if (Number.isFinite(value)) {
    void store.updatePreferences({ editorFontSize: value });
  }
}

const historyWrap = ref<HTMLElement | null>(null);
const historyMenuOpen = ref(false);

function formatLastOpened(timestamp: number): string {
  const elapsed = Date.now() - timestamp;
  if (elapsed < 60_000) return '刚刚';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function closeHistoryMenu(): void {
  historyMenuOpen.value = false;
}

function toggleHistoryMenu(): void {
  if (!store.busy) {
    historyMenuOpen.value = !historyMenuOpen.value;
  }
}

function onDocumentClick(event: MouseEvent): void {
  if (historyMenuOpen.value && !historyWrap.value?.contains(event.target as Node)) {
    closeHistoryMenu();
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeHistoryMenu();
  }
}

function openHistoryWorkspace(id: string): void {
  closeHistoryMenu();
  void store.openWorkspaceHistory(id);
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <footer class="statusbar" aria-label="当前文档状态">
    <div class="statusbar__group">
      <button
        class="statusbar__workspace"
        type="button"
        title="切换工作空间"
        :disabled="store.busy"
        @click="store.openLocalWorkspace()"
      >
        <FolderInput :size="14" aria-hidden="true" />
        <span class="statusbar__workspace-name">{{ store.workspaceName }}</span>
      </button>
      <div ref="historyWrap" class="statusbar__history-wrap">
        <button
          class="statusbar__history-button"
          type="button"
          title="工作空间历史"
          aria-label="工作空间历史"
          aria-haspopup="menu"
          :aria-expanded="historyMenuOpen"
          :disabled="store.busy"
          @click="toggleHistoryMenu"
        >
          <History :size="14" aria-hidden="true" />
        </button>
        <div
          v-if="historyMenuOpen"
          class="statusbar__history-menu"
          role="menu"
          aria-label="最近打开的工作空间"
        >
          <p class="statusbar__history-label">最近打开的工作空间</p>
          <template v-if="store.workspaceHistory.length > 0">
            <button
              v-for="entry in store.workspaceHistory"
              :key="entry.id"
              class="statusbar__history-item"
              type="button"
              role="menuitem"
              :disabled="store.busy || entry.id === store.workspaceHistoryId"
              @click="openHistoryWorkspace(entry.id)"
            >
              <Folder :size="15" class="statusbar__history-item-icon" aria-hidden="true" />
              <span class="statusbar__history-item-body">
                <strong>{{ entry.name }}</strong>
                <small>{{ formatLastOpened(entry.lastOpenedAt) }}</small>
              </span>
              <span v-if="entry.id === store.workspaceHistoryId" class="statusbar__history-current"
                >当前</span
              >
            </button>
          </template>
          <p v-else class="statusbar__history-empty">暂无历史记录</p>
        </div>
      </div>
      <span
        class="statusbar__item statusbar__document-path min-w-0 max-w-[48vw]"
        :title="documentPath"
      >
        <FileText :size="14" class="shrink-0" aria-hidden="true" />
        <span class="truncate">
          <span v-for="(segment, index) in documentPathSegments" :key="`${segment}-${index}`">
            <span>{{ segment }}</span>
            <span
              v-if="index < documentPathSegments.length - 1"
              class="statusbar__path-separator"
              aria-hidden="true"
              >/</span
            >
          </span>
        </span>
      </span>
    </div>

    <div class="statusbar__group statusbar__group--controls">
      <span
        class="statusbar__item statusbar__item--word-count"
        :aria-label="`字数 ${characterCount}`"
      >
        {{ characterCount }} 字
      </span>
      <span
        class="statusbar__item statusbar__item--cursor-position"
        :aria-label="`第 ${store.cursorLine} 行，第 ${store.cursorColumn} 列`"
      >
        行 {{ store.cursorLine }}，列 {{ store.cursorColumn }}
      </span>
      <label
        class="statusbar__select-control statusbar__select-control--font-size"
        title="编辑器字号"
      >
        <span>字号</span>
        <select
          :value="store.preferences.editorFontSize"
          aria-label="编辑器字号"
          @change="setEditorFontSize"
        >
          <option v-for="size in fontSizeOptions" :key="size" :value="size">{{ size }} px</option>
        </select>
      </label>
      <label
        class="statusbar__sync-control statusbar__sync-control--autosave"
        title="停止输入一段时间后自动保存当前文档"
      >
        <input
          type="checkbox"
          :checked="store.preferences.autoSaveEnabled"
          @change="setBooleanPreference('autoSaveEnabled', $event)"
        />
        <span>自动保存</span>
      </label>
      <label
        class="statusbar__select-control statusbar__select-control--autosave-delay"
        title="自动保存延迟"
      >
        <span>延迟</span>
        <select
          :value="store.preferences.autoSaveDelay"
          :disabled="!store.preferences.autoSaveEnabled"
          aria-label="自动保存延迟"
          @change="setAutosaveDelay"
        >
          <option v-for="option in autosaveOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="statusbar__sync-control" title="长行会在编辑区宽度内折行显示">
        <input
          type="checkbox"
          :checked="store.preferences.wordWrap"
          @change="setBooleanPreference('wordWrap', $event)"
        />
        <span>自动换行</span>
      </label>
      <label
        class="statusbar__sync-control statusbar__sync-control--line-numbers"
        title="在编辑器左侧显示源码行号"
      >
        <input
          type="checkbox"
          :checked="store.preferences.lineNumbers"
          @change="setBooleanPreference('lineNumbers', $event)"
        />
        <span>显示行号</span>
      </label>
      <label
        class="statusbar__sync-control statusbar__sync-control--sync-scroll"
        title="同步编辑器与预览区域的滚动位置"
      >
        <input
          type="checkbox"
          :checked="store.preferences.syncScroll"
          :disabled="!store.preferences.previewEnabled || store.isPlainTextDocument"
          @change="setBooleanPreference('syncScroll', $event)"
        />
        <span>同步滚动</span>
      </label>
      <button
        class="statusbar__lock-button"
        :class="{ 'statusbar__lock-button--locked': store.isActiveDocumentLocked }"
        type="button"
        :title="lockLabel"
        :aria-label="lockLabel"
        :aria-pressed="store.isActiveDocumentLocked"
        :disabled="!store.activePath || store.saveState === 'saving'"
        @click="void store.toggleActiveDocumentLock()"
      >
        <LockKeyhole v-if="store.isActiveDocumentLocked" :size="14" aria-hidden="true" />
        <LockKeyholeOpen v-else :size="14" aria-hidden="true" />
      </button>
    </div>
  </footer>
</template>
