import { computed, onBeforeUnmount, ref } from 'vue';
import { defaultState, uid, WALLS } from './catalog';
import { norm, pushOut } from './geometry';
import {
  createDocument,
  deleteDocument,
  listDocuments,
  loadLegacyPlan,
  saveDocument,
} from './storage';
import type { Furniture, LibraryItem, PlanDocument, PlanState, Point, Selection } from './types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const LAST_KEY = 'meowv-studio:floorplan:v1:last-active';
const describeError = (error: unknown) =>
  error instanceof Error ? error.message : '本地存储不可用，请导出方案备份后重试。';

export function useFloorplan() {
  const documents = ref<PlanDocument[]>([]);
  const active = ref<PlanDocument>(createDocument());
  const ready = ref(false);
  const error = ref('');
  const selection = ref<Selection>(null);
  const changeVersion = ref(0);
  const dirtyIds = new Set<string>();
  const dirty = ref(false);
  const revisions = new Map<string, number>();
  const versions = new Map<string, number>();
  const histories = new Map<string, { undo: string[]; redo: string[] }>();
  const historyVersion = ref(0);
  let before: string | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saveQueue = Promise.resolve(true);
  let disposed = false;
  const state = computed(() => active.value.state);
  const furniture = computed(() =>
    selection.value?.kind === 'furn'
      ? state.value.furniture.find((f) => f.id === selection.value?.id)
      : undefined,
  );
  function history() {
    const id = active.value.id;
    if (!histories.has(id)) histories.set(id, { undo: [], redo: [] });
    return histories.get(id)!;
  }
  const canUndo = computed(() => {
    void historyVersion.value;
    return history().undo.length > 0;
  });
  const canRedo = computed(() => {
    void historyVersion.value;
    return history().redo.length > 0;
  });
  function validateSelection() {
    if (selection.value?.kind === 'furn' && !furniture.value) selection.value = null;
  }
  function touch() {
    const doc = active.value;
    doc.updatedAt = new Date().toISOString();
    dirtyIds.add(doc.id);
    versions.set(doc.id, (versions.get(doc.id) ?? 0) + 1);
    dirty.value = true;
    changeVersion.value++;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void flush();
    }, 350);
  }
  function beginEdit() {
    if (before === null) before = JSON.stringify(state.value);
  }
  function finishEdit(cancel = false) {
    if (before === null) return;
    const previous = before;
    before = null;
    if (cancel) {
      active.value.state = JSON.parse(previous) as PlanState;
      changeVersion.value++;
      return;
    }
    if (JSON.stringify(state.value) === previous) return;
    const h = history();
    h.undo.push(previous);
    if (h.undo.length > 150) h.undo.shift();
    h.redo.length = 0;
    historyVersion.value++;
    validateSelection();
    touch();
  }
  function mutate(action: (state: PlanState) => void) {
    finishEdit(true);
    beginEdit();
    action(state.value);
    finishEdit();
  }
  function previewFurniture(id: string, patch: Partial<Furniture>) {
    const item = state.value.furniture.find((f) => f.id === id);
    if (item) Object.assign(item, patch);
    changeVersion.value++;
  }
  function patchFurniture(patch: Partial<Furniture>) {
    const id = furniture.value?.id;
    if (!id) return;
    mutate((s) => {
      const f = s.furniture.find((f) => f.id === id);
      if (f) Object.assign(f, patch);
    });
  }
  function undo() {
    finishEdit(true);
    const h = history(),
      snapshot = h.undo.pop();
    if (!snapshot) return;
    h.redo.push(JSON.stringify(state.value));
    active.value.state = JSON.parse(snapshot) as PlanState;
    historyVersion.value++;
    validateSelection();
    touch();
  }
  function redo() {
    finishEdit(true);
    const h = history(),
      snapshot = h.redo.pop();
    if (!snapshot) return;
    h.undo.push(JSON.stringify(state.value));
    active.value.state = JSON.parse(snapshot) as PlanState;
    historyVersion.value++;
    validateSelection();
    touch();
  }
  function addFurniture(item: LibraryItem, point: Point) {
    const f: Furniture = {
      id: uid(),
      type: item[0],
      name: item[1],
      w: item[2],
      d: item[3],
      color: item[4],
      cx: point[0],
      cy: point[1],
      rot: 0,
    };
    pushOut(f, state.value);
    mutate((s) => {
      if (f.type === 'rug') s.furniture.unshift(f);
      else s.furniture.push(f);
    });
    selection.value = { kind: 'furn', id: f.id };
  }
  function duplicateFurniture() {
    if (!furniture.value) return;
    const f = {
      ...furniture.value,
      id: uid(),
      cx: furniture.value.cx + 200,
      cy: furniture.value.cy + 200,
    };
    mutate((s) => {
      s.furniture.push(f);
    });
    selection.value = { kind: 'furn', id: f.id };
  }
  function removeFurniture() {
    const id = furniture.value?.id;
    if (id)
      mutate((s) => {
        s.furniture = s.furniture.filter((f) => f.id !== id);
      });
  }
  function orderFurniture(top: boolean) {
    const id = furniture.value?.id;
    if (!id) return;
    mutate((s) => {
      const index = s.furniture.findIndex((f) => f.id === id);
      const [f] = s.furniture.splice(index, 1);
      if (f) {
        if (top) s.furniture.push(f);
        else s.furniture.unshift(f);
      }
    });
  }
  function rotate(degrees: number) {
    if (furniture.value) patchFurniture({ rot: norm(furniture.value.rot + degrees) });
  }
  function toggleWall(id: string): boolean {
    const wall = WALLS[Number(id.slice(1))];
    if (!wall || (wall[4] !== 'n' && wall[4] !== 'low')) return false;
    mutate((s) => {
      s.demolished = s.demolished.includes(id)
        ? s.demolished.filter((v) => v !== id)
        : [...s.demolished, id];
    });
    return true;
  }
  function setLastActive() {
    try {
      localStorage.setItem(LAST_KEY, active.value.id);
    } catch {
      /* 当前会话仍可使用。 */
    }
  }
  async function flush(): Promise<boolean> {
    clearTimeout(saveTimer);
    // 拖动中的预览不进入磁盘；由 pointerup 提交后再保存。
    if (before !== null) return false;
    saveQueue = saveQueue.then(async () => {
      for (const id of [...dirtyIds]) {
        const doc = documents.value.find((d) => d.id === id);
        if (!doc) continue;
        const version = versions.get(id);
        try {
          const saved = await saveDocument(clone(doc), revisions.get(id) ?? null);
          revisions.set(id, saved.revision);
          doc.revision = saved.revision;
          if (versions.get(id) === version) dirtyIds.delete(id);
          error.value = '';
        } catch (cause) {
          error.value = describeError(cause);
          dirty.value = true;
          return false;
        }
      }
      dirty.value = dirtyIds.size > 0;
      return !dirty.value;
    });
    return saveQueue;
  }
  function activate(doc: PlanDocument) {
    active.value = doc;
    selection.value = null;
    before = null;
    historyVersion.value++;
    changeVersion.value++;
    setLastActive();
  }
  async function initialize() {
    try {
      const docs = await listDocuments();
      if (disposed) return;
      documents.value = docs;
      docs.forEach((d) => revisions.set(d.id, d.revision));
      if (docs.length) {
        let last: string | null = null;
        try {
          last = localStorage.getItem(LAST_KEY);
        } catch {
          /* 无偏好时使用最近方案。 */
        }
        activate(documents.value.find((d) => d.id === last) ?? documents.value[0]);
      } else {
        const doc = loadLegacyPlan() ?? active.value;
        documents.value.push(doc);
        activate(doc);
        touch();
      }
    } catch (cause) {
      error.value = describeError(cause);
      documents.value = [active.value];
      dirtyIds.add(active.value.id);
      dirty.value = true;
    } finally {
      ready.value = true;
    }
  }
  async function switchDocument(id: string) {
    finishEdit(true);
    if (id === active.value.id) return true;
    if (!(await flush())) return false;
    const doc = documents.value.find((d) => d.id === id);
    if (doc) activate(doc);
    return Boolean(doc);
  }
  async function addDocument(doc = createDocument(), preserveOnFailure = false) {
    finishEdit(true);
    if (!preserveOnFailure && !(await flush())) return false;
    documents.value.unshift(doc);
    activate(doc);
    touch();
    return true;
  }
  async function copyDocument() {
    const copy = createDocument(`${active.value.title} 副本`, clone(state.value));
    return addDocument(copy, true);
  }
  async function removeDocument() {
    const id = active.value.id;
    try {
      await saveQueue;
      await deleteDocument(id);
      dirtyIds.delete(id);
      revisions.delete(id);
      versions.delete(id);
      histories.delete(id);
      documents.value = documents.value.filter((d) => d.id !== id);
      if (!documents.value.length) {
        const doc = createDocument();
        documents.value.push(doc);
        activate(doc);
        touch();
      } else activate(documents.value[0]);
      error.value = '';
      dirty.value = dirtyIds.size > 0;
      return true;
    } catch (cause) {
      error.value = describeError(cause);
      return false;
    }
  }
  async function reloadRemote() {
    try {
      const remote = (await listDocuments()).find((d) => d.id === active.value.id);
      if (!remote) {
        error.value = '此方案已在其他窗口删除。请另存副本。';
        return false;
      }
      dirtyIds.delete(remote.id);
      revisions.set(remote.id, remote.revision);
      histories.delete(remote.id);
      const index = documents.value.findIndex((d) => d.id === remote.id);
      documents.value[index] = remote;
      activate(remote);
      dirty.value = dirtyIds.size > 0;
      error.value = '';
      return true;
    } catch (cause) {
      error.value = describeError(cause);
      return false;
    }
  }
  function rename(title: string) {
    const next = title.trim().slice(0, 120);
    if (next && next !== active.value.title) {
      active.value.title = next;
      touch();
    }
  }
  function reset() {
    mutate((s) => Object.assign(s, defaultState()));
    selection.value = null;
  }
  onBeforeUnmount(() => {
    disposed = true;
    finishEdit(true);
    clearTimeout(saveTimer);
    void flush();
  });
  return {
    documents,
    active,
    state,
    ready,
    error,
    dirty,
    selection,
    furniture,
    changeVersion,
    canUndo,
    canRedo,
    initialize,
    flush,
    beginEdit,
    finishEdit,
    previewFurniture,
    mutate,
    patchFurniture,
    undo,
    redo,
    addFurniture,
    duplicateFurniture,
    removeFurniture,
    orderFurniture,
    rotate,
    toggleWall,
    switchDocument,
    addDocument,
    copyDocument,
    removeDocument,
    reloadRemote,
    rename,
    reset,
  };
}
