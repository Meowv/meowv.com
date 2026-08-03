<script setup lang="ts">
import { computed } from 'vue';
import { FileText, FolderInput, LockKeyhole, LockKeyholeOpen } from '@/features/markdown/icons';
import { useWorkspaceStore } from '@/features/markdown/stores/workspace';
import type { AutoSaveDelay, WorkspacePreferences } from '@/features/markdown/types/workspace';

type BooleanPreferenceKey = 'autoSaveEnabled' | 'wordWrap' | 'lineNumbers' | 'syncScroll';

const store = useWorkspaceStore();

const characterCount = computed(() => Array.from(store.activeContent.replace(/\s/gu, '')).length);

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
      <label class="statusbar__sync-control" title="同步编辑器与预览区域的滚动位置">
        <input
          type="checkbox"
          :checked="store.preferences.syncScroll"
          :disabled="!store.preferences.previewEnabled"
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
