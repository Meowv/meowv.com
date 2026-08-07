<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useTheme } from '@/composables/useTheme';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import NoteCard from '@/features/notes/components/NoteCard.vue';
import NotesHeader from '@/features/notes/components/NotesHeader.vue';
import {
  clearNoteStickies,
  createNoteSticky,
  deleteNoteSticky,
  listNoteStickies,
  saveNotesBatch,
} from '@/features/notes/storage';
import type { NoteSticky } from '@/features/notes/types';
import { NOTE_PIN_Z_BASE } from '@/features/notes/types';
import '@/features/notes/notes.css';

const HEADER_PREFERENCE_KEY = `${STORAGE_POLICY.namespace('notes')}:header-collapsed`;

const { resolved: resolvedTheme, toggle: toggleTheme } = useTheme();

const notes = ref<NoteSticky[]>([]);
const headerVisible = ref(true);
const loading = ref(true);
const topZ = ref(0);
const canvasRef = ref<HTMLElement | null>(null);

let saveTimer: number | null = null;
let saveQueue = Promise.resolve();
let pendingSaves = new Set<string>();
let createdCount = 0;

const allCollapsed = computed(
  () => notes.value.length > 0 && notes.value.every((n) => n.collapsed),
);

function enqueueSave(operation: () => Promise<void>): Promise<void> {
  const queued = saveQueue.then(operation, operation);
  saveQueue = queued.catch(() => undefined);
  return queued;
}

function flushSaves(): void {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingSaves.size === 0) return;
  const batch = notes.value.filter((note) => pendingSaves.has(note.id));
  pendingSaves.clear();
  void enqueueSave(() => saveNotesBatch(batch)).catch((error: unknown) => {
    console.error('保存便签失败：', error);
  });
}

function scheduleSave(note: NoteSticky, delay = 700): void {
  pendingSaves.add(note.id);
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => flushSaves(), delay);
}

function patchNote(id: string, patch: Partial<NoteSticky>): void {
  const note = notes.value.find((item) => item.id === id);
  if (!note) return;
  if (patch.pinned !== undefined && patch.pinned !== note.pinned) {
    if (patch.pinned) {
      note.zIndex = maxPinnedZ() + 1;
    } else {
      topZ.value += 1;
      note.zIndex = topZ.value;
    }
  }
  Object.assign(note, patch);
}

function saveNote(id: string): void {
  const note = notes.value.find((item) => item.id === id);
  if (note) scheduleSave(note, 0);
}

function maxPinnedZ(): number {
  return notes.value.reduce(
    (max, note) => (note.pinned ? Math.max(max, note.zIndex) : max),
    NOTE_PIN_Z_BASE,
  );
}

function bringToFront(id: string): void {
  const note = notes.value.find((item) => item.id === id);
  if (!note) return;
  if (note.pinned) {
    note.zIndex = maxPinnedZ() + 1;
  } else {
    topZ.value += 1;
    note.zIndex = topZ.value;
  }
  scheduleSave(note, 0);
}

function createNote(): void {
  const canvas = canvasRef.value;
  const baseX = canvas ? Math.max(16, (canvas.clientWidth - 300) / 2) : 80;
  const baseY = canvas ? Math.max(16, (canvas.clientHeight - 220) / 2) : 80;
  const offset = (createdCount % 6) * 28;
  const note = createNoteSticky('', baseX + offset, baseY + offset, topZ.value + 1);
  topZ.value = note.zIndex;
  notes.value.push(note);
  createdCount += 1;
  scheduleSave(note, 0);
}

async function deleteNote(id: string): Promise<void> {
  const note = notes.value.find((item) => item.id === id);
  if (!note) return;
  if (
    !window.confirm(`删除便签“${note.content.split('\n')[0] || '空白便签'}”？本地便签将无法恢复。`)
  ) {
    return;
  }
  notes.value = notes.value.filter((item) => item.id !== id);
  pendingSaves.delete(id);
  try {
    await deleteNoteSticky(id);
  } catch (error) {
    console.error('删除便签失败：', error);
  }
}

async function clearAll(): Promise<void> {
  if (notes.value.length === 0) return;
  if (!window.confirm('确定删除全部本地便签吗？此操作无法撤销。')) return;
  pendingSaves.clear();
  notes.value = [];
  topZ.value = 0;
  createdCount = 0;
  await clearNoteStickies().catch((error: unknown) => {
    console.error('清空便签失败：', error);
  });
}

function toggleAll(): void {
  if (notes.value.length === 0) return;
  const nextCollapsed = !allCollapsed.value;
  for (const note of notes.value) {
    note.collapsed = nextCollapsed;
    pendingSaves.add(note.id);
  }
  flushSaves();
}

function collapseOthers(id: string): void {
  if (notes.value.length < 2) return;
  for (const note of notes.value) {
    note.collapsed = note.id !== id;
    pendingSaves.add(note.id);
  }
  flushSaves();
}

function arrangeCanvas(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const gap = 16;
  const viewportWidth = canvas.clientWidth;
  const viewportHeight = canvas.clientHeight;
  const sorted = [...notes.value].sort((a, b) => a.zIndex - b.zIndex);
  const keepVisible = 16;
  const stackStepY = 24;
  const stackPerColumn = 8;
  const stackColumnWidth = 320;
  const stackOriginX = viewportWidth - 340;
  const stackOriginY = viewportHeight - 240;
  let x = gap;
  let y = gap;
  let rowHeight = 0;
  let stacked = 0;
  for (const note of sorted) {
    if (x + note.width + gap > viewportWidth) {
      x = gap;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    if (y + note.height > viewportHeight - keepVisible) {
      const column = Math.floor(stacked / stackPerColumn);
      const index = stacked % stackPerColumn;
      note.x = stackOriginX - column * stackColumnWidth + index * 10;
      note.y = stackOriginY + index * stackStepY;
      stacked += 1;
      pendingSaves.add(note.id);
      continue;
    }
    note.x = x;
    note.y = y;
    x += note.width + gap;
    rowHeight = Math.max(rowHeight, note.height);
    pendingSaves.add(note.id);
  }
  if (pendingSaves.size > 0) flushSaves();
}

function toggleHeader(): void {
  headerVisible.value = !headerVisible.value;
  if (!storageAvailable()) return;
  try {
    if (headerVisible.value) localStorage.removeItem(HEADER_PREFERENCE_KEY);
    else localStorage.setItem(HEADER_PREFERENCE_KEY, 'true');
  } catch {
    // 本地偏好不可用时保留当前页面状态。
  }
}

function normalizeLayerOrder(): void {
  const unpinned = [...notes.value]
    .filter((note) => !note.pinned)
    .sort((a, b) => a.zIndex - b.zIndex);
  const pinned = [...notes.value].filter((note) => note.pinned).sort((a, b) => a.zIndex - b.zIndex);
  topZ.value = 0;
  for (const note of unpinned) {
    topZ.value += 1;
    note.zIndex = topZ.value;
  }
  let pinBase = NOTE_PIN_Z_BASE;
  for (const note of pinned) {
    pinBase += 1;
    note.zIndex = pinBase;
  }
}

async function initialize(): Promise<void> {
  if (storageAvailable()) {
    try {
      headerVisible.value = localStorage.getItem(HEADER_PREFERENCE_KEY) !== 'true';
    } catch {
      // 本地偏好不可用时默认显示顶部栏。
    }
  }
  try {
    notes.value = await listNoteStickies();
    normalizeLayerOrder();
  } catch (error) {
    console.error('读取便签失败：', error);
  }
  if (notes.value.length === 0) createNote();
  loading.value = false;
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') flushSaves();
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (pendingSaves.size === 0) return;
  flushSaves();
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  void initialize();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
  flushSaves();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);
});
</script>

<template>
  <section class="notes-editor" aria-label="便签画布">
    <NotesHeader
      :header-visible="headerVisible"
      :all-collapsed="allCollapsed"
      :resolved-theme="resolvedTheme"
      @toggle-header="toggleHeader"
      @create="createNote"
      @toggle-all="toggleAll"
      @arrange="arrangeCanvas"
      @clear="clearAll"
      @toggle-theme="toggleTheme"
    />

    <main ref="canvasRef" class="notes-editor__workspace">
      <div class="notes-editor__surface" aria-hidden="true"></div>
      <template v-if="!loading">
        <NoteCard
          v-for="note in notes"
          :key="note.id"
          :note="note"
          @update="patchNote"
          @save="saveNote"
          @delete="deleteNote"
          @front="bringToFront"
          @shake="collapseOthers"
        />
        <div v-if="notes.length === 0" class="notes-editor__empty" role="status">
          <strong>还没有便签</strong>
          <p>点击顶栏的新建按钮，创建第一张便签。</p>
        </div>
      </template>
    </main>
  </section>
</template>
