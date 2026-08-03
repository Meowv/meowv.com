import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

import type { WorkbookFileType, WorkbookRecord, WorkbookSnapshot } from "@/models/workbook";
import { workbookService } from "@/services/workbook.service";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export type WorkbookListItem = Omit<WorkbookRecord, "snapshot" | "thumbnail"> & {
  hasThumbnail: boolean;
};

const toListItem = (record: WorkbookRecord): WorkbookListItem => {
  return {
    id: record.id,
    name: record.name,
    sourceFileName: record.sourceFileName,
    sourceFileType: record.sourceFileType,
    sheetCount: record.sheetCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
    lastExportedAt: record.lastExportedAt,
    schemaVersion: record.schemaVersion,
    hasLocalChanges: record.hasLocalChanges,
    deletedAt: record.deletedAt,
    hasThumbnail: Boolean(record.thumbnail),
  };
};

export const useWorkbookStore = defineStore("workbook", () => {
  const currentWorkbookId = ref<string | null>(null);
  const currentWorkbookName = ref("");
  const currentSheetId = ref<string | null>(null);
  const saveStatus = ref<SaveStatus>("idle");
  const loading = ref(false);
  const workbooks = shallowRef<WorkbookListItem[]>([]);
  const trashedWorkbooks = shallowRef<WorkbookListItem[]>([]);

  const activeWorkbook = computed(
    () => workbooks.value.find((workbook) => workbook.id === currentWorkbookId.value) ?? null,
  );

  async function refresh() {
    loading.value = true;
    try {
      const [active, trashed] = await Promise.all([
        workbookService.list(),
        workbookService.listTrash(),
      ]);
      workbooks.value = active.map(toListItem);
      trashedWorkbooks.value = trashed.map(toListItem);
    } finally {
      loading.value = false;
    }
  }

  async function createBlank(name?: string) {
    const record = await workbookService.createBlank(name);
    workbooks.value = [toListItem(record), ...workbooks.value];
    setCurrent(record);
    return record;
  }

  async function createFromSnapshot(
    snapshot: WorkbookSnapshot,
    name: string,
    sourceFileName?: string,
    sourceFileType?: WorkbookFileType,
  ) {
    const record = await workbookService.createFromSnapshot(
      snapshot,
      name,
      sourceFileName,
      sourceFileType,
    );
    workbooks.value = [toListItem(record), ...workbooks.value];
    setCurrent(record);
    return record;
  }

  async function open(id: string) {
    const record = await workbookService.get(id);
    if (!record) throw new Error("找不到该工作簿，它可能已被删除。");
    await workbookService.markOpened(id);
    setCurrent(record);
    await refresh();
    return record;
  }

  async function rename(id: string, name: string) {
    const cleanName = name.trim();
    if (!cleanName) throw new Error("工作簿名称不能为空。");
    const record = await workbookService.rename(id, cleanName);
    replaceSummary(record);
    if (currentWorkbookId.value === id) currentWorkbookName.value = record.name;
    return record;
  }

  async function duplicate(id: string) {
    const record = await workbookService.duplicate(id);
    workbooks.value = [toListItem(record), ...workbooks.value];
    return record;
  }

  async function moveToTrash(id: string) {
    const record = await workbookService.moveToTrash(id);
    workbooks.value = workbooks.value.filter((item) => item.id !== id);
    trashedWorkbooks.value = [toListItem(record), ...trashedWorkbooks.value];
    if (currentWorkbookId.value === id) clearCurrent();
    return record;
  }

  async function restore(id: string) {
    const record = await workbookService.restore(id);
    trashedWorkbooks.value = trashedWorkbooks.value.filter((item) => item.id !== id);
    workbooks.value = [toListItem(record), ...workbooks.value];
    return record;
  }

  async function deletePermanently(id: string) {
    await workbookService.deletePermanently(id);
    trashedWorkbooks.value = trashedWorkbooks.value.filter((item) => item.id !== id);
    if (currentWorkbookId.value === id) clearCurrent();
  }

  async function clearAll() {
    await workbookService.clearAll();
    workbooks.value = [];
    trashedWorkbooks.value = [];
    clearCurrent();
  }

  function setCurrent(record: Pick<WorkbookRecord, "id" | "name">) {
    currentWorkbookId.value = record.id;
    currentWorkbookName.value = record.name;
    saveStatus.value = "saved";
  }

  function clearCurrent() {
    currentWorkbookId.value = null;
    currentWorkbookName.value = "";
    currentSheetId.value = null;
    saveStatus.value = "idle";
  }

  function replaceSummary(record: WorkbookRecord) {
    const next = toListItem(record);
    const replace = (items: WorkbookListItem[]) =>
      items.map((item) => (item.id === record.id ? next : item));
    workbooks.value = replace(workbooks.value);
    trashedWorkbooks.value = replace(trashedWorkbooks.value);
  }

  return {
    activeWorkbook,
    currentSheetId,
    currentWorkbookId,
    currentWorkbookName,
    loading,
    saveStatus,
    trashedWorkbooks,
    workbooks,
    clearAll,
    clearCurrent,
    createBlank,
    createFromSnapshot,
    deletePermanently,
    duplicate,
    moveToTrash,
    open,
    refresh,
    rename,
    restore,
    setCurrent,
  };
});
