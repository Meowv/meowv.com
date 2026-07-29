<script setup lang="ts">
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Keyboard,
  LoaderCircle,
  ShieldCheck,
} from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { BooleanNumber } from "@univerjs/presets";

import CompatibilityDialog from "@/components/home/CompatibilityDialog.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import ToastRegion from "@/components/common/ToastRegion.vue";
import EditorDialog from "@/components/editor/EditorDialog.vue";
import EditorHeader from "@/components/editor/EditorHeader.vue";
import HistoryDialog from "@/components/editor/HistoryDialog.vue";
import XlsxExportWarningDialog from "@/components/editor/XlsxExportWarningDialog.vue";
import type { EditorAction } from "@/components/editor/editor.types";
import { useUniver, type UniverEditorController } from "@/composables/useUniver";
import { IMPORT_FILE_ACCEPT } from "@/constants/file";
import type { WorkbookRecord, WorkbookRevision, WorkbookSnapshot } from "@/models/workbook";
import { AutoSaveService } from "@/services/autosave.service";
import { backupService } from "@/services/backup.service";
import { downloadExport, exportService } from "@/services/export.service";
import { importService } from "@/services/import.service";
import { revisionService } from "@/services/revision.service";
import { workbookService } from "@/services/workbook.service";
import { useAppStore } from "@/stores/app.store";
import { useEditorStore } from "@/stores/editor.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useWorkbookStore } from "@/stores/workbook.store";
import type { CompatibilityReport } from "@/types/normalized-workbook";

const props = defineProps<{
  id: string;
}>();

interface BeforeAppUpdateDetail {
  waitUntil: (promise: Promise<unknown>) => void;
}

interface PrintCellView {
  key: string;
  value: string;
  rowSpan: number;
  columnSpan: number;
  style: Record<string, string | undefined>;
}

interface PrintRowView {
  key: string;
  rowNumber: number;
  height: number;
  cells: PrintCellView[];
}

interface PrintSheetView {
  name: string;
  columnLabels: string[];
  columnWidths: number[];
  rows: PrintRowView[];
}

interface PrintRangeBounds {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

interface PrintSelection {
  sheetId: string;
  notation: string;
  range: PrintRangeBounds;
}

const router = useRouter();
const appStore = useAppStore();
const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const workbookStore = useWorkbookStore();

const editorContainer = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const workbook = shallowRef<WorkbookRecord | null>(null);
const recoveryRecord = shallowRef<WorkbookRecord | null>(null);
const loading = ref(true);
const loadError = ref("");
const online = ref(navigator.onLine);
const dragging = ref(false);

const deleteOpen = ref(false);
const infoOpen = ref(false);
const helpOpen = ref(false);
const historyOpen = ref(false);
const xlsxWarningOpen = ref(false);
const printOpen = ref(false);
const historyBusy = ref(false);
const revisions = shallowRef<WorkbookRevision[]>([]);
const printSheet = shallowRef<PrintSheetView | null>(null);
const printSnapshot = shallowRef<WorkbookSnapshot | null>(null);
const printSheetId = ref("");
const printSelection = shallowRef<PrintSelection | null>(null);
const printOptions = ref({
  range: "sheet" as "sheet" | "selection",
  orientation: "landscape" as "portrait" | "landscape",
  margin: "normal" as "narrow" | "normal" | "wide",
  showGridlines: true,
  showHeaders: true,
  fitToWidth: true,
});

const compatibilityOpen = ref(false);
const compatibilityReport = shallowRef<CompatibilityReport | null>(null);
const compatibilityFileName = ref("");
const importedWorkbookId = ref("");
const importController = shallowRef<AbortController | null>(null);

let controller: UniverEditorController | null = null;
let autoSaveService: AutoSaveService | null = null;
let unsubscribeAutoSave: (() => void) | null = null;
let snapshotCaptureTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;

const SNAPSHOT_CAPTURE_DELAY = 250;
const MAX_PRINT_ROWS = 2_000;
const MAX_PRINT_COLUMNS = 100;
const MAX_PRINT_CELLS = 50_000;

const busy = computed(
  () =>
    loading.value || appStore.importActivity.active || appStore.isExporting || historyBusy.value,
);

const sourceLabel = computed(() => {
  const labels = {
    xlsx: "XLSX 文件",
    xls: "XLS 文件",
    csv: "CSV 文件",
    local: "本地创建",
    template: "示例模板",
  } as const;
  return workbook.value?.sourceFileType ? labels[workbook.value.sourceFileType] : "本地创建";
});

const lastSavedText = computed(() => {
  if (!workbook.value?.updatedAt) return "暂无保存记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(workbook.value.updatedAt);
});

function snapshotWithDisplaySettings(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  const next = structuredClone(snapshot);
  next.defaultStyle = {
    ...(typeof next.defaultStyle === "object" && next.defaultStyle ? next.defaultStyle : {}),
    fs: settingsStore.settings.defaultFontSize,
  };
  Object.values(next.sheets).forEach((sheet) => {
    sheet.showGridlines = settingsStore.settings.showGridlines
      ? BooleanNumber.TRUE
      : BooleanNumber.FALSE;
  });
  return next;
}

function createLatestRecord(markChanged = true): WorkbookRecord {
  if (!workbook.value || !controller) throw new Error("工作簿尚未准备完成");
  const rawSnapshot = controller.getSnapshot();
  const snapshot: WorkbookSnapshot = {
    ...rawSnapshot,
    id: workbook.value.id,
    name: workbook.value.name,
  };
  return {
    ...workbook.value,
    snapshot,
    sheetCount: snapshot.sheetOrder.length || Object.keys(snapshot.sheets).length,
    updatedAt: Date.now(),
    hasLocalChanges: markChanged ? true : workbook.value.hasLocalChanges,
  };
}

function spreadsheetColumnLabel(index: number): string {
  let current = index + 1;
  let label = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }
  return label;
}

function printColor(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return undefined;
  const rgb = (value as { rgb?: unknown }).rgb;
  return typeof rgb === "string" ? rgb : undefined;
}

function printCellValue(value: unknown, formula: unknown): string {
  if (value === null || value === undefined) {
    return typeof formula === "string" ? formula : "";
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const dataStream = (
      value as {
        body?: {
          dataStream?: unknown;
        };
      }
    ).body?.dataStream;
    if (typeof dataStream === "string") return dataStream.replace(/\r/g, "\n").trimEnd();
  }
  return String(value);
}

function printRangeNotation(range: PrintRangeBounds): string {
  const start = `${spreadsheetColumnLabel(range.startColumn)}${range.startRow + 1}`;
  const end = `${spreadsheetColumnLabel(range.endColumn)}${range.endRow + 1}`;
  return start === end ? start : `${start}:${end}`;
}

function assertSafePrintRange(range: PrintRangeBounds): void {
  const coordinates = [range.startRow, range.startColumn, range.endRow, range.endColumn];
  if (
    coordinates.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    range.endRow < range.startRow ||
    range.endColumn < range.startColumn
  ) {
    throw new Error("打印范围包含无效的行列坐标，请重新选择后再试。");
  }

  const rowCount = range.endRow - range.startRow + 1;
  const columnCount = range.endColumn - range.startColumn + 1;
  const cellCount = rowCount * columnCount;
  if (
    !Number.isSafeInteger(rowCount) ||
    !Number.isSafeInteger(columnCount) ||
    !Number.isSafeInteger(cellCount) ||
    rowCount > MAX_PRINT_ROWS ||
    columnCount > MAX_PRINT_COLUMNS ||
    cellCount > MAX_PRINT_CELLS
  ) {
    throw new Error(
      `当前打印范围为 ${rowCount.toLocaleString("zh-CN")} 行 × ${columnCount.toLocaleString(
        "zh-CN",
      )} 列（${cellCount.toLocaleString(
        "zh-CN",
      )} 个单元格），超过安全上限：最多 ${MAX_PRINT_ROWS.toLocaleString(
        "zh-CN",
      )} 行、${MAX_PRINT_COLUMNS.toLocaleString(
        "zh-CN",
      )} 列，且总计不超过 ${MAX_PRINT_CELLS.toLocaleString(
        "zh-CN",
      )} 个单元格。请缩小选区或删除工作表末尾多余的格式后重试。`,
    );
  }
}

function resolvePrintRange(
  snapshot: WorkbookSnapshot,
  sheetId: string,
  requestedRange?: PrintRangeBounds,
): PrintRangeBounds {
  const sheet = snapshot.sheets[sheetId];
  if (!sheet) throw new Error("找不到要打印的工作表。");
  if (requestedRange) {
    assertSafePrintRange(requestedRange);
    return requestedRange;
  }

  const cellData = sheet.cellData ?? {};
  const rowData = sheet.rowData ?? {};
  const columnData = sheet.columnData ?? {};
  const merges = sheet.mergeData ?? [];
  if (merges.length > MAX_PRINT_CELLS) {
    throw new Error(
      `当前工作表包含超过 ${MAX_PRINT_CELLS.toLocaleString(
        "zh-CN",
      )} 个合并区域，无法安全生成打印内容。`,
    );
  }
  let maxRow = 0;
  let maxColumn = 0;

  Object.entries(cellData).forEach(([rowKey, columns]) => {
    const row = Number(rowKey);
    if (!Number.isSafeInteger(row) || row < 0 || !columns) return;
    maxRow = Math.max(maxRow, row);
    Object.keys(columns).forEach((columnKey) => {
      const column = Number(columnKey);
      if (Number.isSafeInteger(column) && column >= 0) {
        maxColumn = Math.max(maxColumn, column);
      }
    });
  });
  Object.keys(rowData).forEach((rowKey) => {
    const row = Number(rowKey);
    if (Number.isSafeInteger(row) && row >= 0) maxRow = Math.max(maxRow, row);
  });
  Object.keys(columnData).forEach((columnKey) => {
    const column = Number(columnKey);
    if (Number.isSafeInteger(column) && column >= 0) {
      maxColumn = Math.max(maxColumn, column);
    }
  });
  merges.forEach((merge) => {
    const mergeRange: PrintRangeBounds = {
      startRow: merge.startRow,
      startColumn: merge.startColumn,
      endRow: merge.endRow,
      endColumn: merge.endColumn,
    };
    if (
      [merge.startRow, merge.startColumn, merge.endRow, merge.endColumn].some(
        (value) => !Number.isSafeInteger(value) || value < 0,
      ) ||
      merge.endRow < merge.startRow ||
      merge.endColumn < merge.startColumn
    ) {
      throw new Error("当前工作表包含无效的合并单元格范围，无法安全生成打印内容。");
    }
    assertSafePrintRange(mergeRange);
    maxRow = Math.max(maxRow, merge.endRow);
    maxColumn = Math.max(maxColumn, merge.endColumn);
  });

  const range: PrintRangeBounds = {
    startRow: 0,
    startColumn: 0,
    endRow: maxRow,
    endColumn: maxColumn,
  };
  assertSafePrintRange(range);
  return range;
}

function buildPrintSheet(
  snapshot: WorkbookSnapshot,
  sheetId: string,
  range: PrintRangeBounds,
  displayValues: string[][],
): PrintSheetView {
  const sheet = snapshot.sheets[sheetId];
  if (!sheet) throw new Error("找不到要打印的工作表。");
  assertSafePrintRange(range);

  const cellData = sheet.cellData ?? {};
  const rowData = sheet.rowData ?? {};
  const columnData = sheet.columnData ?? {};
  const merges = sheet.mergeData ?? [];
  if (merges.length > MAX_PRINT_CELLS) {
    throw new Error(
      `当前打印范围涉及超过 ${MAX_PRINT_CELLS.toLocaleString(
        "zh-CN",
      )} 个合并区域，无法安全生成打印内容。`,
    );
  }
  const printableMerges = merges
    .map((merge) => ({
      startRow: Math.max(range.startRow, merge.startRow),
      startColumn: Math.max(range.startColumn, merge.startColumn),
      endRow: Math.min(range.endRow, merge.endRow),
      endColumn: Math.min(range.endColumn, merge.endColumn),
      sourceRow: merge.startRow,
      sourceColumn: merge.startColumn,
    }))
    .filter((merge) => merge.startRow <= merge.endRow && merge.startColumn <= merge.endColumn);
  const mergedCellCoverage = printableMerges.reduce(
    (total, merge) =>
      total + (merge.endRow - merge.startRow + 1) * (merge.endColumn - merge.startColumn + 1),
    0,
  );
  if (
    printableMerges.length > MAX_PRINT_CELLS ||
    !Number.isSafeInteger(mergedCellCoverage) ||
    mergedCellCoverage > MAX_PRINT_CELLS
  ) {
    throw new Error(
      `当前打印范围内的合并区域过多，无法安全生成打印内容。请将范围控制在 ${MAX_PRINT_CELLS.toLocaleString(
        "zh-CN",
      )} 个合并单元格以内。`,
    );
  }

  const mergeStarts = new Map<string, (typeof printableMerges)[number]>();
  const mergedFollowers = new Set<string>();
  printableMerges.forEach((merge) => {
    mergeStarts.set(`${merge.startRow}:${merge.startColumn}`, merge);
    for (let row = merge.startRow; row <= merge.endRow; row += 1) {
      for (let column = merge.startColumn; column <= merge.endColumn; column += 1) {
        if (row !== merge.startRow || column !== merge.startColumn) {
          mergedFollowers.add(`${row}:${column}`);
        }
      }
    }
  });

  const rows: PrintRowView[] = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const cells: PrintCellView[] = [];
    for (let column = range.startColumn; column <= range.endColumn; column += 1) {
      const key = `${row}:${column}`;
      if (mergedFollowers.has(key)) continue;
      const merge = mergeStarts.get(key);
      const sourceRow = merge?.sourceRow ?? row;
      const sourceColumn = merge?.sourceColumn ?? column;
      const cell = cellData[sourceRow]?.[sourceColumn];
      const rawStyle = cell?.s;
      const style =
        typeof rawStyle === "string"
          ? snapshot.styles[rawStyle]
          : typeof rawStyle === "object"
            ? rawStyle
            : undefined;
      const displayValue = displayValues[row - range.startRow]?.[column - range.startColumn];
      cells.push({
        key,
        value: displayValue ?? printCellValue(cell?.v, cell?.f),
        rowSpan: merge ? merge.endRow - merge.startRow + 1 : 1,
        columnSpan: merge ? merge.endColumn - merge.startColumn + 1 : 1,
        style: {
          fontFamily: style?.ff ?? undefined,
          fontSize: style?.fs ? `${style.fs}pt` : undefined,
          fontWeight: style?.bl === BooleanNumber.TRUE ? "700" : undefined,
          fontStyle: style?.it === BooleanNumber.TRUE ? "italic" : undefined,
          color: printColor(style?.cl),
          backgroundColor: printColor(style?.bg),
        },
      });
    }
    rows.push({
      key: String(row),
      rowNumber: row + 1,
      height: Math.max(20, Math.min(160, rowData[row]?.h ?? sheet.defaultRowHeight ?? 24)),
      cells,
    });
  }

  return {
    name: `${sheet.name ?? "Sheet"} · ${printRangeNotation(range)}`,
    columnLabels: Array.from({ length: range.endColumn - range.startColumn + 1 }, (_, index) =>
      spreadsheetColumnLabel(range.startColumn + index),
    ),
    columnWidths: Array.from({ length: range.endColumn - range.startColumn + 1 }, (_, index) =>
      Math.max(
        48,
        Math.min(320, columnData[range.startColumn + index]?.w ?? sheet.defaultColumnWidth ?? 88),
      ),
    ),
    rows,
  };
}

function syncSaveState(status: string, error?: unknown) {
  workbookStore.saveStatus =
    status === "dirty" || status === "saving" || status === "saved" || status === "error"
      ? status
      : "idle";

  if (status === "dirty") editorStore.setDirty();
  else if (status === "saving") editorStore.setSaving();
  else if (status === "saved") editorStore.setSaved();
  else if (status === "error") editorStore.setSaveError(error);
}

function setupAutoSave() {
  unsubscribeAutoSave?.();
  autoSaveService?.dispose();
  autoSaveService = new AutoSaveService({
    delay: settingsStore.settings.autoSaveDelay,
  });
  unsubscribeAutoSave = autoSaveService.subscribe((state) => {
    syncSaveState(state.status, state.error);
    if (state.status === "saved" && workbook.value && state.savedAt) {
      workbook.value = {
        ...workbook.value,
        updatedAt: state.savedAt,
        hasLocalChanges: true,
      };
    }
  });
}

function clearSnapshotCaptureTimer() {
  if (snapshotCaptureTimer === undefined) return;
  clearTimeout(snapshotCaptureTimer);
  snapshotCaptureTimer = undefined;
}

function captureAndScheduleAutoSave() {
  snapshotCaptureTimer = undefined;
  if (
    !workbook.value ||
    !controller ||
    disposed ||
    !settingsStore.settings.autoSave ||
    !autoSaveService
  ) {
    return;
  }

  try {
    const latest = createLatestRecord();
    workbook.value = latest;
    void autoSaveService.schedule(latest).catch(() => undefined);
  } catch (error) {
    editorStore.setSaveError(error);
  }
}

function handleMutation() {
  if (!workbook.value || !controller || disposed) return;
  editorStore.setDirty();
  workbookStore.saveStatus = "dirty";
  if (settingsStore.settings.autoSave && autoSaveService && snapshotCaptureTimer === undefined) {
    snapshotCaptureTimer = setTimeout(captureAndScheduleAutoSave, SNAPSHOT_CAPTURE_DELAY);
  }
}

function mountUniver(record: WorkbookRecord) {
  if (!editorContainer.value) throw new Error("编辑器容器不可用");
  editorContainer.value.replaceChildren();
  controller = useUniver({
    container: editorContainer.value,
    snapshot: snapshotWithDisplaySettings(record.snapshot),
    darkMode: settingsStore.effectiveTheme === "dark",
    showFormulaBar: settingsStore.settings.showFormulaBar,
    showStatusBar: settingsStore.settings.showStatusBar,
    onMutation: handleMutation,
  });
}

async function saveCurrent(options: { silent?: boolean } = {}) {
  if (!workbook.value || !controller || !autoSaveService) return;
  clearSnapshotCaptureTimer();
  const latest = createLatestRecord();
  workbook.value = latest;
  try {
    await autoSaveService.saveNow(latest);
  } catch (error) {
    editorStore.setSaveError(error);
    if (!options.silent) {
      appStore.pushToast("保存失败", {
        message: appStore.errorMessage(error, "请检查浏览器存储空间后重试。"),
        type: "error",
        duration: 7000,
      });
    }
    throw error;
  }
}

async function initialize() {
  loading.value = true;
  loadError.value = "";
  recoveryRecord.value = null;
  try {
    if (!settingsStore.loaded) await settingsStore.load();
    const record = await workbookService.get(props.id);
    if (!record || record.deletedAt !== undefined) {
      throw new Error("找不到该工作簿，它可能已被删除或位于回收站。");
    }
    recoveryRecord.value = record;
    await workbookService.markOpened(record.id);
    workbook.value = {
      ...record,
      lastOpenedAt: Date.now(),
    };
    workbookStore.setCurrent(workbook.value);
    editorStore.setWorkbook(record.id, record.name);
    setupAutoSave();
    await nextTick();
    mountUniver(workbook.value);
    recoveryRecord.value = null;
    editorStore.setSaved();
  } catch (error) {
    controller?.dispose();
    controller = null;
    unsubscribeAutoSave?.();
    unsubscribeAutoSave = null;
    autoSaveService?.dispose();
    autoSaveService = null;
    workbook.value = null;
    workbookStore.clearCurrent();
    if (recoveryRecord.value) {
      try {
        revisions.value = await revisionService.list(recoveryRecord.value.id);
      } catch {
        revisions.value = [];
      }
    }
    loadError.value = appStore.errorMessage(error, "工作簿加载失败。");
  } finally {
    loading.value = false;
  }
}

async function renameWorkbook(name: string) {
  if (!workbook.value || !controller) return;
  try {
    controller.api.getActiveWorkbook()?.setName(name);
    const renamed = await workbookService.rename(workbook.value.id, name);
    workbook.value = {
      ...renamed,
      snapshot: controller.getSnapshot(),
    };
    editorStore.setWorkbook(renamed.id, renamed.name);
    workbookStore.setCurrent(renamed);
    appStore.pushToast("工作簿已重命名", { type: "success" });
  } catch (error) {
    controller.api.getActiveWorkbook()?.setName(workbook.value.name);
    appStore.pushToast("重命名失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  }
}

function focusEditor() {
  const focusTarget = editorContainer.value?.querySelector<HTMLElement>(
    '[tabindex]:not([tabindex="-1"]), canvas',
  );
  focusTarget?.focus();
}

function activateRibbonTab(label: string) {
  const tab = [
    ...(editorContainer.value?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []),
  ].find((item) => item.textContent?.trim() === label);
  if (tab) tab.click();
  else focusEditor();
}

function triggerFind() {
  focusEditor();
  const isApple = /Mac|iPhone|iPad/.test(navigator.platform);
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "f",
      code: "KeyF",
      metaKey: isApple,
      ctrlKey: !isApple,
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function createBlankWorkbook() {
  await saveCurrent();
  const created = await workbookService.createBlank();
  await router.push(`/workbook/${created.id}`);
}

async function moveToTrash() {
  if (!workbook.value) return;
  try {
    await saveCurrent({ silent: true });
    await workbookService.moveToTrash(workbook.value.id);
    deleteOpen.value = false;
    appStore.pushToast("已移入回收站", {
      message: "可在首页回收站中恢复。",
      type: "success",
    });
    await router.replace("/");
  } catch (error) {
    appStore.pushToast("删除失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  }
}

async function startExport(format: "xlsx" | "csv" | "json" | "msheet") {
  if (!workbook.value || !controller) return;
  appStore.isExporting = true;
  editorStore.isExporting = true;
  try {
    await saveCurrent({ silent: true });
    const latest = createLatestRecord(false);
    let backup;
    if (format === "msheet") {
      editorStore.setOperation("正在收集完整备份", 8);
      backup = await backupService.createWorkbookBackup(latest, {
        onProgress(progress) {
          editorStore.setOperation(progress.message, progress.percent);
        },
      });
    }
    const activeSheetId = controller.api.getActiveWorkbook()?.getActiveSheet().getSheetId();
    const exported = await exportService.exportWorkbook(latest.snapshot, {
      format,
      fileName: latest.name,
      sheetId: format === "csv" ? activeSheetId : undefined,
      backup,
      onProgress(progress) {
        editorStore.setOperation(progress.message, progress.percent);
      },
    });
    downloadExport(exported);

    if (format === "xlsx" || format === "msheet") {
      const exportedAt = Date.now();
      await workbookService.markExported(latest.id);
      workbook.value = {
        ...latest,
        lastExportedAt: exportedAt,
        hasLocalChanges: false,
      };
    }
    appStore.pushToast("文件已生成", {
      message: exported.fileName,
      type: "success",
    });
  } catch (error) {
    appStore.pushToast("导出失败", {
      message: appStore.errorMessage(error),
      type: "error",
      duration: 7000,
    });
  } finally {
    editorStore.setOperation("", null);
    editorStore.isExporting = false;
    appStore.isExporting = false;
  }
}

async function exportRecoveryBackup() {
  if (!recoveryRecord.value) return;
  appStore.isExporting = true;
  try {
    const backup = await backupService.createWorkbookBackup(recoveryRecord.value);
    const exported = await exportService.exportWorkbook(recoveryRecord.value.snapshot, {
      format: "msheet",
      fileName: `${recoveryRecord.value.name}-原始数据`,
      backup,
    });
    downloadExport(exported);
    appStore.pushToast("原始数据已导出", {
      message: exported.fileName,
      type: "success",
    });
  } catch (error) {
    appStore.pushToast("原始数据导出失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    appStore.isExporting = false;
  }
}

async function preparePrint() {
  if (!workbook.value || !controller) return;
  try {
    await saveCurrent({ silent: true });
    const latest = createLatestRecord(false);
    const activeWorkbook = controller.api.getActiveWorkbook();
    const activeSheet = activeWorkbook?.getActiveSheet();
    const sheetId = activeSheet?.getSheetId();
    if (!sheetId) throw new Error("找不到当前工作表。");
    const activeRange = activeWorkbook?.getActiveRange();
    const selectedRange = activeRange?.getRange();
    printSnapshot.value = latest.snapshot;
    printSheetId.value = sheetId;
    printSheet.value = null;
    printSelection.value =
      activeRange && selectedRange && activeRange.getSheetId() === sheetId
        ? {
            sheetId,
            notation: activeRange.getA1Notation(),
            range: {
              startRow: selectedRange.startRow,
              startColumn: selectedRange.startColumn,
              endRow: selectedRange.endRow,
              endColumn: selectedRange.endColumn,
            },
          }
        : null;
    printOptions.value.range = "sheet";
    printOpen.value = true;
  } catch (error) {
    appStore.pushToast("无法准备打印内容", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  }
}

function closePrintDialog() {
  printOpen.value = false;
  printSnapshot.value = null;
  printSheetId.value = "";
  printSelection.value = null;
}

async function confirmPrint() {
  if (!controller || !printSnapshot.value || !printSheetId.value) {
    appStore.pushToast("无法准备打印内容", {
      message: "打印数据已失效，请关闭窗口后重新打开打印设置。",
      type: "error",
    });
    return;
  }

  try {
    const requestedRange =
      printOptions.value.range === "selection" ? printSelection.value?.range : undefined;
    if (printOptions.value.range === "selection" && !requestedRange) {
      throw new Error("当前没有可打印的选中区域，请返回工作表重新选择。");
    }
    const range = resolvePrintRange(printSnapshot.value, printSheetId.value, requestedRange);
    // 必须先通过上限校验，再向 Facade 读取显示值或构造合并区与打印 DOM。
    assertSafePrintRange(range);
    const activeWorkbook = controller.api.getActiveWorkbook();
    const activeSheet = activeWorkbook?.getSheetBySheetId(printSheetId.value);
    if (!activeSheet) throw new Error("找不到要打印的工作表。");
    const displayValues = activeSheet.getRange(range).getDisplayValues();
    printSheet.value = buildPrintSheet(
      printSnapshot.value,
      printSheetId.value,
      range,
      displayValues,
    );
  } catch (error) {
    appStore.pushToast("无法准备打印内容", {
      message: appStore.errorMessage(error),
      type: "error",
      duration: 8000,
    });
    return;
  }

  const margins = {
    narrow: "6mm",
    normal: "12mm",
    wide: "20mm",
  } as const;
  const style = document.createElement("style");
  style.id = "workbook-print-page-style";
  style.textContent = `@page { size: A4 ${printOptions.value.orientation}; margin: ${
    margins[printOptions.value.margin]
  }; }`;
  document.getElementById(style.id)?.remove();
  document.head.append(style);
  printOpen.value = false;
  printSnapshot.value = null;
  printSheetId.value = "";
  printSelection.value = null;
  await nextTick();

  const cleanup = () => {
    style.remove();
    printSheet.value = null;
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 60_000);
}

async function openHistory() {
  const target = workbook.value ?? recoveryRecord.value;
  if (!target) return;
  historyBusy.value = true;
  historyOpen.value = true;
  try {
    revisions.value = await revisionService.list(target.id);
  } catch (error) {
    appStore.pushToast("无法读取历史版本", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    historyBusy.value = false;
  }
}

async function recoverRevision(revision: WorkbookRevision) {
  if (!recoveryRecord.value) return;
  historyBusy.value = true;
  try {
    const restored = await workbookService.createFromSnapshot(
      revision.snapshot,
      `${recoveryRecord.value.name}（恢复）`,
      recoveryRecord.value.sourceFileName,
      "local",
    );
    historyOpen.value = false;
    appStore.pushToast("已创建恢复工作簿", {
      message: "原工作簿仍保留在当前浏览器中。",
      type: "success",
    });
    await router.replace(`/workbook/${restored.id}`);
  } catch (error) {
    appStore.pushToast("恢复失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    historyBusy.value = false;
  }
}

async function createRevision() {
  if (!workbook.value) return;
  historyBusy.value = true;
  try {
    await saveCurrent({ silent: true });
    await revisionService.create(workbook.value.id, "manual");
    revisions.value = await revisionService.list(workbook.value.id);
    appStore.pushToast("本地版本已创建", { type: "success" });
  } catch (error) {
    appStore.pushToast("创建版本失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    historyBusy.value = false;
  }
}

async function restoreRevision(revision: WorkbookRevision) {
  if (recoveryRecord.value) {
    await recoverRevision(revision);
    return;
  }
  if (!workbook.value) return;
  historyBusy.value = true;
  try {
    await saveCurrent({ silent: true });
    const restored = await revisionService.restore(workbook.value.id, revision.id);
    controller?.dispose();
    controller = null;
    workbook.value = restored;
    await nextTick();
    mountUniver(restored);
    revisions.value = await revisionService.list(restored.id);
    editorStore.setDirty();
    appStore.pushToast("历史版本已恢复", {
      message: "恢复前的内容也已保留为一个版本。",
      type: "success",
    });
  } catch (error) {
    appStore.pushToast("恢复失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    historyBusy.value = false;
  }
}

async function removeRevision(revision: WorkbookRevision) {
  historyBusy.value = true;
  try {
    await revisionService.remove(revision.id);
    revisions.value = revisions.value.filter((item) => item.id !== revision.id);
  } catch (error) {
    appStore.pushToast("删除版本失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    historyBusy.value = false;
  }
}

async function importFiles(files: FileList | File[]) {
  const file = Array.from(files)[0];
  if (!file || appStore.importActivity.active) return;
  importController.value = new AbortController();
  appStore.beginImport(file);
  try {
    const result = await importService.importFile(file, {
      signal: importController.value.signal,
      onProgress(progress) {
        appStore.updateImport(progress.percent, progress.message);
      },
    });
    compatibilityFileName.value = file.name;
    compatibilityReport.value = result.compatibility;
    importedWorkbookId.value = result.record.id;
    compatibilityOpen.value = true;
  } catch (error) {
    appStore.pushToast("导入失败", {
      message: appStore.errorMessage(error, "请检查文件格式后重试。"),
      type: "error",
      duration: 7000,
    });
  } finally {
    importController.value = null;
    appStore.finishImport();
    if (fileInput.value) fileInput.value.value = "";
  }
}

async function openImportedWorkbook() {
  if (!importedWorkbookId.value) return;
  compatibilityOpen.value = false;
  await saveCurrent({ silent: true });
  await router.push(`/workbook/${importedWorkbookId.value}`);
}

function cancelImport() {
  importController.value?.abort();
}

function handleDrop(event: DragEvent) {
  dragging.value = false;
  if (event.dataTransfer?.files.length) void importFiles(event.dataTransfer.files);
}

async function handleAction(action: EditorAction) {
  try {
    switch (action) {
      case "home":
        await router.push("/");
        break;
      case "new":
        await createBlankWorkbook();
        break;
      case "open":
        fileInput.value?.click();
        break;
      case "save":
        await saveCurrent();
        appStore.pushToast("已保存到当前浏览器", { type: "success" });
        break;
      case "revision":
        await createRevision();
        break;
      case "history":
        await openHistory();
        break;
      case "export-xlsx":
        xlsxWarningOpen.value = true;
        break;
      case "export-csv":
        await startExport("csv");
        break;
      case "export-json":
        await startExport("json");
        break;
      case "export-backup":
        await startExport("msheet");
        break;
      case "print":
        await preparePrint();
        break;
      case "info":
        infoOpen.value = true;
        break;
      case "trash":
        deleteOpen.value = true;
        break;
      case "undo":
        await controller?.api.undo();
        break;
      case "redo":
        await controller?.api.redo();
        break;
      case "find":
        triggerFind();
        break;
      case "focus-editor":
        focusEditor();
        break;
      case "ribbon-insert":
        activateRibbonTab("插入");
        break;
      case "ribbon-format":
        activateRibbonTab("开始");
        break;
      case "ribbon-data":
        activateRibbonTab("数据");
        break;
      case "ribbon-view":
        focusEditor();
        appStore.pushToast("视图操作", {
          message: "冻结窗格、缩放和工作表显示选项位于编辑器工具栏与底部状态栏。",
          type: "info",
        });
        break;
      case "help":
        helpOpen.value = true;
        break;
      case "settings":
        await router.push("/settings");
        break;
    }
  } catch (error) {
    appStore.pushToast("操作未完成", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  }
}

function handleOnlineState() {
  online.value = navigator.onLine;
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden" && editorStore.saveStatus === "dirty") {
    void saveCurrent({ silent: true }).catch(() => undefined);
  }
}

function handlePageHide() {
  if (editorStore.saveStatus === "dirty") {
    void saveCurrent({ silent: true }).catch(() => undefined);
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (editorStore.saveStatus !== "dirty" && editorStore.saveStatus !== "saving") return;
  void saveCurrent({ silent: true }).catch(() => undefined);
  event.preventDefault();
}

function handleBeforeAppUpdate(event: Event) {
  const detail = (event as CustomEvent<BeforeAppUpdateDetail>).detail;
  detail.waitUntil(
    saveCurrent({ silent: true }).catch((error) => {
      appStore.pushToast("更新前保存失败", {
        message: appStore.errorMessage(error),
        type: "error",
      });
      throw error;
    }),
  );
}

function handleKeyboardShortcut(event: KeyboardEvent) {
  if (event.altKey || (!event.metaKey && !event.ctrlKey)) return;
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "s" && event.shiftKey) {
    event.preventDefault();
    if (!busy.value) xlsxWarningOpen.value = true;
    return;
  }
  if (event.shiftKey) return;

  const action = key === "s" ? "save" : key === "n" ? "new" : key === "o" ? "open" : null;
  if (!action) return;

  event.preventDefault();
  if (!busy.value) void handleAction(action);
}

onBeforeRouteLeave(async () => {
  if (!workbook.value || !controller) return true;
  try {
    await saveCurrent({ silent: true });
    return true;
  } catch {
    appStore.pushToast("尚未离开当前工作簿", {
      message: "内容保存失败，请重试或先导出文件。",
      type: "error",
    });
    return false;
  }
});

onMounted(() => {
  window.addEventListener("online", handleOnlineState);
  window.addEventListener("offline", handleOnlineState);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("keydown", handleKeyboardShortcut);
  window.addEventListener("meowv:before-app-update", handleBeforeAppUpdate);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void initialize();
});

onBeforeUnmount(() => {
  disposed = true;
  clearSnapshotCaptureTimer();
  window.removeEventListener("online", handleOnlineState);
  window.removeEventListener("offline", handleOnlineState);
  window.removeEventListener("pagehide", handlePageHide);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("keydown", handleKeyboardShortcut);
  window.removeEventListener("meowv:before-app-update", handleBeforeAppUpdate);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  importController.value?.abort();
  unsubscribeAutoSave?.();
  const flushPromise = autoSaveService?.flush();
  void flushPromise?.finally(() => autoSaveService?.dispose());
  controller?.dispose();
  controller = null;
});
</script>

<template>
  <main
    class="workbook-view"
    :class="{ 'is-dragging': dragging }"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.self.prevent="dragging = false"
    @drop.prevent="handleDrop"
  >
    <template v-if="workbook">
      <EditorHeader
        :name="workbook.name"
        :save-status="editorStore.saveStatus"
        :save-status-text="editorStore.saveStatusText"
        :online="online"
        :busy="busy"
        @rename="renameWorkbook"
        @action="handleAction"
      />
      <section ref="editorContainer" class="univer-host" aria-label="电子表格编辑区域" />
    </template>

    <section v-else class="workbook-loading" :class="{ 'is-error': loadError }">
      <template v-if="loadError">
        <AlertCircle :size="30" />
        <h1>无法打开工作簿</h1>
        <p>{{ loadError }}</p>
        <p v-if="recoveryRecord && revisions.length" class="workbook-loading__recovery-note">
          当前工作簿无法正常打开，但检测到 {{ revisions.length }} 个可用历史版本。
        </p>
        <div class="workbook-loading__actions">
          <button
            v-if="recoveryRecord && revisions[0]"
            class="button button--primary"
            type="button"
            :disabled="historyBusy"
            @click="recoverRevision(revisions[0])"
          >
            恢复最近版本
          </button>
          <button
            v-if="recoveryRecord && revisions.length"
            class="button button--secondary"
            type="button"
            @click="openHistory"
          >
            选择其他版本
          </button>
          <button
            v-if="recoveryRecord"
            class="button button--secondary"
            type="button"
            @click="exportRecoveryBackup"
          >
            导出原始数据
          </button>
          <button class="button button--secondary" type="button" @click="router.replace('/')">
            返回首页
          </button>
        </div>
      </template>
      <template v-else>
        <LoaderCircle class="is-spinning" :size="30" />
        <h1>正在准备编辑器</h1>
        <p>工作簿从当前浏览器的本地存储中读取。</p>
      </template>
    </section>

    <div v-if="dragging" class="drop-overlay">
      <FileSpreadsheet :size="36" />
      <strong>松开以打开本地表格</strong>
      <span>支持 .xlsx、.xls 和 .csv，文件不会上传</span>
    </div>

    <div v-if="appStore.importActivity.active" class="operation-overlay" aria-live="assertive">
      <div class="operation-card">
        <LoaderCircle class="is-spinning" :size="24" />
        <div>
          <strong>{{ appStore.importActivity.fileName }}</strong>
          <span>{{ appStore.importActivity.stage }}</span>
        </div>
        <span class="operation-card__percent">
          {{
            appStore.importActivity.progress === null
              ? "处理中"
              : `${Math.round(appStore.importActivity.progress)}%`
          }}
        </span>
        <div class="operation-card__track">
          <span
            :style="{
              width:
                appStore.importActivity.progress === null
                  ? '34%'
                  : `${appStore.importActivity.progress}%`,
            }"
          />
        </div>
        <button class="button button--secondary" type="button" @click="cancelImport">取消</button>
      </div>
    </div>

    <div v-if="appStore.isExporting" class="export-status" aria-live="polite">
      <LoaderCircle class="is-spinning" :size="16" />
      <span>{{ editorStore.operationLabel || "正在生成文件" }}</span>
      <strong v-if="editorStore.operationProgress !== null">
        {{ Math.round(editorStore.operationProgress) }}%
      </strong>
    </div>

    <section
      v-if="printSheet"
      class="print-sheet"
      :class="{
        'has-gridlines': printOptions.showGridlines,
        'is-fit-to-width': printOptions.fitToWidth,
      }"
      :aria-label="`${printSheet.name} 打印内容`"
    >
      <header>
        <h1>{{ workbook?.name }}</h1>
        <p>{{ printSheet.name }}</p>
      </header>
      <table>
        <colgroup>
          <col v-if="printOptions.showHeaders" class="print-sheet__row-header-column" />
          <col
            v-for="(width, index) in printSheet.columnWidths"
            :key="index"
            :style="{ width: `${width}px` }"
          />
        </colgroup>
        <thead v-if="printOptions.showHeaders">
          <tr>
            <th aria-hidden="true" />
            <th v-for="label in printSheet.columnLabels" :key="label" scope="col">
              {{ label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in printSheet.rows" :key="row.key" :style="{ height: `${row.height}px` }">
            <th v-if="printOptions.showHeaders" scope="row">{{ row.rowNumber }}</th>
            <td
              v-for="cell in row.cells"
              :key="cell.key"
              :rowspan="cell.rowSpan"
              :colspan="cell.columnSpan"
              :style="cell.style"
            >
              {{ cell.value }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <input
      ref="fileInput"
      class="sr-only"
      type="file"
      :accept="IMPORT_FILE_ACCEPT"
      @change="
        ($event.target as HTMLInputElement).files &&
        importFiles(($event.target as HTMLInputElement).files!)
      "
    />

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="将工作簿移入回收站？"
      :description="`“${workbook?.name ?? ''}”会停止编辑并移入回收站，之后仍可恢复。`"
      confirm-label="移入回收站"
      dangerous
      @confirm="moveToTrash"
    />

    <HistoryDialog
      :open="historyOpen"
      :revisions="revisions"
      :busy="historyBusy"
      :allow-create="!recoveryRecord"
      :recovery-mode="Boolean(recoveryRecord)"
      @close="historyOpen = false"
      @create="createRevision"
      @restore="restoreRevision"
      @remove="removeRevision"
    />

    <EditorDialog
      :open="infoOpen"
      title="工作簿信息"
      description="这些信息来自当前浏览器中的本地记录。"
      @close="infoOpen = false"
    >
      <dl v-if="workbook" class="info-list">
        <div>
          <dt>名称</dt>
          <dd>{{ workbook.name }}</dd>
        </div>
        <div>
          <dt>工作表</dt>
          <dd>{{ workbook.sheetCount }} 个</dd>
        </div>
        <div>
          <dt>来源</dt>
          <dd>{{ sourceLabel }}</dd>
        </div>
        <div>
          <dt>原始文件</dt>
          <dd>{{ workbook.sourceFileName || "—" }}</dd>
        </div>
        <div>
          <dt>最近保存</dt>
          <dd>{{ lastSavedText }}</dd>
        </div>
        <div>
          <dt>导出状态</dt>
          <dd>{{ workbook.hasLocalChanges ? "有尚未导出的本地修改" : "已导出最新版本" }}</dd>
        </div>
      </dl>
      <div class="local-only-note">
        <ShieldCheck :size="19" />
        <span>工作簿内容没有上传到服务器，默认保存在此浏览器的 IndexedDB。</span>
      </div>
      <template #footer>
        <button class="button button--primary" type="button" @click="infoOpen = false">
          知道了
        </button>
      </template>
    </EditorDialog>

    <XlsxExportWarningDialog
      v-model:open="xlsxWarningOpen"
      @backup="startExport('msheet')"
      @confirm="startExport('xlsx')"
    />

    <EditorDialog
      :open="printOpen"
      title="打印设置"
      description="使用当前工作表或选中区域生成适合浏览器打印的表格。"
      width="620px"
      @close="closePrintDialog"
    >
      <div class="print-settings">
        <label>
          <span>打印范围</span>
          <select v-model="printOptions.range">
            <option value="sheet">当前 Sheet</option>
            <option value="selection" :disabled="!printSelection">
              {{
                printSelection
                  ? `选中区域（${printSelection.notation}）`
                  : "选中区域（请先在工作表中选择）"
              }}
            </option>
          </select>
        </label>
        <label>
          <span>方向</span>
          <select v-model="printOptions.orientation">
            <option value="portrait">纵向</option>
            <option value="landscape">横向</option>
          </select>
        </label>
        <label>
          <span>纸张</span>
          <select disabled>
            <option>A4</option>
          </select>
        </label>
        <label>
          <span>页边距</span>
          <select v-model="printOptions.margin">
            <option value="narrow">窄</option>
            <option value="normal">普通</option>
            <option value="wide">宽</option>
          </select>
        </label>
        <label class="print-settings__check">
          <input v-model="printOptions.showGridlines" type="checkbox" />
          <span>显示网格线</span>
        </label>
        <label class="print-settings__check">
          <input v-model="printOptions.showHeaders" type="checkbox" />
          <span>显示行列标题</span>
        </label>
        <label class="print-settings__check">
          <input v-model="printOptions.fitToWidth" type="checkbox" />
          <span>缩放到一页宽</span>
        </label>
      </div>
      <div class="local-only-note">
        <ShieldCheck :size="19" />
        <span>
          打印预览只在当前设备生成，不会上传工作表内容。单次最多
          {{ MAX_PRINT_ROWS.toLocaleString("zh-CN") }} 行、{{
            MAX_PRINT_COLUMNS.toLocaleString("zh-CN")
          }}
          列，且不超过 {{ MAX_PRINT_CELLS.toLocaleString("zh-CN") }} 个单元格。
        </span>
      </div>
      <template #footer>
        <button class="button button--secondary" type="button" @click="closePrintDialog">
          取消
        </button>
        <button class="button button--primary" type="button" @click="confirmPrint">
          打开系统打印
        </button>
      </template>
    </EditorDialog>

    <EditorDialog :open="helpOpen" title="编辑帮助" width="640px" @close="helpOpen = false">
      <div class="help-grid">
        <section>
          <Keyboard :size="21" />
          <h3>常用快捷键</h3>
          <ul>
            <li><kbd>Cmd/Ctrl + N</kbd><span>新建工作簿</span></li>
            <li><kbd>Cmd/Ctrl + O</kbd><span>打开本地文件</span></li>
            <li><kbd>Cmd/Ctrl + S</kbd><span>保存到浏览器</span></li>
            <li><kbd>Cmd/Ctrl + Shift + S</kbd><span>导出或另存为</span></li>
            <li><kbd>Cmd/Ctrl + Z</kbd><span>撤销</span></li>
            <li><kbd>Cmd/Ctrl + F</kbd><span>查找与替换</span></li>
            <li><kbd>Enter / Tab</kbd><span>确认并移动选区</span></li>
          </ul>
        </section>
        <section>
          <CheckCircle2 :size="21" />
          <h3>已支持</h3>
          <p>
            单元格编辑、公式、复制粘贴、格式、数字格式、行列与工作表操作、合并、冻结、排序筛选、数据验证、条件格式、批注及本地历史版本。
          </p>
        </section>
      </div>
      <div class="local-only-note">
        <ShieldCheck :size="19" />
        <span>请定期导出 XLSX 或完整备份；清理浏览器数据后本地工作簿可能无法恢复。</span>
      </div>
      <template #footer>
        <button class="button button--primary" type="button" @click="helpOpen = false">关闭</button>
      </template>
    </EditorDialog>

    <CompatibilityDialog
      v-model:open="compatibilityOpen"
      :file-name="compatibilityFileName"
      :report="compatibilityReport"
      @open-workbook="openImportedWorkbook"
      @close="compatibilityOpen = false"
    />

    <ToastRegion :toasts="appStore.toasts" @dismiss="appStore.dismissToast" />
  </main>
</template>

<style scoped>
.workbook-view {
  position: relative;
  display: flex;
  width: 100%;
  height: 100dvh;
  min-height: 520px;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-bg);
}

.workbook-loading__recovery-note {
  color: var(--primary-text) !important;
  font-weight: 600;
}

.workbook-loading__actions {
  display: flex;
  max-width: 620px;
  flex-wrap: wrap;
  justify-content: center;
  gap: 9px;
}

.print-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.print-settings > label:not(.print-settings__check) {
  display: grid;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 620;
}

.print-settings select {
  min-height: 38px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface);
  padding: 0 10px;
  color: var(--text);
}

.print-settings__check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}

.print-sheet {
  display: none;
}

.univer-host {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: var(--surface);
}

.workbook-loading {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 24px;
  color: var(--text-secondary);
  text-align: center;
}

.workbook-loading h1 {
  margin: 3px 0 0;
  color: var(--text);
  font-size: 19px;
}

.workbook-loading p {
  max-width: 480px;
  margin: 0 0 10px;
  color: var(--text-tertiary);
  font-size: 13px;
  line-height: 1.65;
}

.workbook-loading.is-error {
  color: var(--danger-text);
}

.drop-overlay {
  position: absolute;
  z-index: 1000;
  inset: 12px;
  display: grid;
  border: 2px dashed var(--primary-600);
  border-radius: 12px;
  background: var(--primary-surface);
  color: var(--primary-text);
  pointer-events: none;
  place-items: center;
  align-content: center;
  gap: 8px;
}

.drop-overlay strong {
  font-size: 18px;
}

.drop-overlay span {
  color: var(--primary-text-soft);
  font-size: 13px;
}

.operation-overlay {
  position: fixed;
  z-index: 3500;
  inset: 0;
  display: grid;
  padding: 24px;
  background: var(--backdrop);
  place-items: center;
}

.operation-card {
  display: grid;
  width: min(520px, 100%);
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  padding: 20px;
  box-shadow: 0 18px 54px rgb(20 33 25 / 18%);
}

.operation-card > div {
  display: grid;
  gap: 3px;
}

.operation-card strong {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operation-card span {
  color: var(--text-tertiary);
  font-size: 12px;
}

.operation-card__percent {
  color: var(--primary-text) !important;
  font-weight: 650;
}

.operation-card__track {
  height: 6px;
  grid-column: 1 / -1;
  overflow: hidden;
  border-radius: 99px;
  background: var(--surface-pressed);
}

.operation-card__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--primary-600);
  transition: width 180ms ease;
}

.operation-card .button {
  grid-column: 1 / -1;
  justify-self: end;
}

.export-status {
  position: fixed;
  z-index: 2500;
  right: 18px;
  bottom: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface);
  padding: 10px 12px;
  box-shadow: 0 8px 26px rgb(22 37 27 / 13%);
  color: var(--text-secondary);
  font-size: 12px;
}

.export-status strong {
  color: var(--primary-text);
}

.info-list {
  display: grid;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.info-list div {
  display: grid;
  min-height: 42px;
  grid-template-columns: 130px minmax(0, 1fr);
  align-items: center;
  border-bottom: 1px solid var(--border);
}

.info-list div:last-child {
  border-bottom: 0;
}

.info-list dt,
.info-list dd {
  margin: 0;
  padding: 9px 12px;
  font-size: 13px;
}

.info-list dt {
  color: var(--text-tertiary);
}

.info-list dd {
  overflow-wrap: anywhere;
  color: var(--text);
  font-weight: 550;
}

.local-only-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 16px;
  border: 1px solid var(--primary-border);
  border-radius: 7px;
  background: var(--primary-surface);
  padding: 11px 12px;
  color: var(--primary-text);
  font-size: 12px;
  line-height: 1.6;
}

.local-only-note svg {
  flex: none;
  margin-top: 1px;
}

.help-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.help-grid section {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 15px;
}

.help-grid section > svg {
  color: var(--primary-text);
}

.help-grid h3 {
  margin: 9px 0 10px;
  color: var(--text);
  font-size: 14px;
}

.help-grid p {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.75;
}

.help-grid ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.help-grid li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 11px;
}

.help-grid kbd {
  border: 1px solid var(--border-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--surface-subtle);
  padding: 3px 6px;
  color: var(--text);
  font: inherit;
}

.is-spinning {
  animation: workbook-spin 800ms linear infinite;
}

@keyframes workbook-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 767px) {
  .workbook-view {
    min-height: 440px;
  }

  .help-grid {
    grid-template-columns: 1fr;
  }

  .print-settings {
    grid-template-columns: 1fr;
  }
}

@media print {
  :global(html),
  :global(body),
  :global(#app) {
    min-height: 100%;
    background: #fff !important;
    color-scheme: light;
  }

  :global(body > :not(#app)),
  :global(.pwa-notice),
  .workbook-view > :not(.print-sheet) {
    display: none !important;
  }

  .workbook-view {
    display: block;
    height: auto;
    min-height: 100%;
    overflow: visible;
    background: #fff;
  }

  .print-sheet {
    display: block;
    color: #111;
    font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  }

  .print-sheet > header {
    margin-bottom: 7mm;
  }

  .print-sheet h1,
  .print-sheet p {
    margin: 0;
  }

  .print-sheet h1 {
    font-size: 16pt;
  }

  .print-sheet p {
    margin-top: 2mm;
    color: #555;
    font-size: 9pt;
  }

  .print-sheet table {
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 9pt;
  }

  .print-sheet.is-fit-to-width table {
    width: 100%;
  }

  .print-sheet th,
  .print-sheet td {
    overflow: hidden;
    padding: 2px 4px;
    vertical-align: middle;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .print-sheet.has-gridlines th,
  .print-sheet.has-gridlines td {
    border: 0.25mm solid #bfc5c1;
  }

  .print-sheet th {
    background: #eef1ef;
    color: #475049;
    font-weight: 600;
    text-align: center;
  }

  .print-sheet__row-header-column {
    width: 10mm;
  }

  .print-sheet tr {
    break-inside: avoid;
  }
}
</style>
