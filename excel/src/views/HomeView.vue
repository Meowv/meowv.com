<script setup lang="ts">
import {
  ArrowDownAZ,
  ArrowUpRight,
  ArrowUpAZ,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HandCoins,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SquarePen,
  Trash2,
  Upload,
  X,
} from "@lucide/vue";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppLogo from "@/components/common/AppLogo.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import ToastRegion from "@/components/common/ToastRegion.vue";
import XlsxExportWarningDialog from "@/components/editor/XlsxExportWarningDialog.vue";
import CompatibilityDialog from "@/components/home/CompatibilityDialog.vue";
import { AppError } from "@/models/app-error";
import type { WorkbookFileType, WorkbookSnapshot } from "@/models/workbook";
import { backupService } from "@/services/backup.service";
import { downloadExport, exportService } from "@/services/export.service";
import { importService } from "@/services/import.service";
import { workbookService } from "@/services/workbook.service";
import { useAppStore } from "@/stores/app.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useWorkbookStore, type WorkbookListItem } from "@/stores/workbook.store";
import type { CompatibilityReport } from "@/types/normalized-workbook";

type SortMode = "lastOpened" | "updated" | "nameAsc" | "nameDesc" | "created";
type LibraryTab = "recent" | "trash";

const router = useRouter();
const appStore = useAppStore();
const settingsStore = useSettingsStore();
const workbookStore = useWorkbookStore();

const query = ref("");
const sortMode = ref<SortMode>("lastOpened");
const activeTab = ref<LibraryTab>("recent");
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const actionId = ref<string | null>(null);
const importController = ref<AbortController | null>(null);

const renameOpen = ref(false);
const renameTarget = ref<WorkbookListItem | null>(null);
const renameValue = ref("");
const trashOpen = ref(false);
const trashTarget = ref<WorkbookListItem | null>(null);
const deleteOpen = ref(false);
const deleteTarget = ref<WorkbookListItem | null>(null);
const clearAllOpen = ref(false);
const xlsxWarningOpen = ref(false);
const exportTarget = ref<WorkbookListItem | null>(null);
const compatibilityOpen = ref(false);
const compatibilityReport = ref<CompatibilityReport | null>(null);
const compatibilityFileName = ref("");
const importedWorkbookId = ref<string | null>(null);

const sourceItems = computed(() =>
  activeTab.value === "recent" ? workbookStore.workbooks : workbookStore.trashedWorkbooks,
);

const visibleItems = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase("zh-CN");
  const filtered = keyword
    ? sourceItems.value.filter(
        (item) =>
          item.name.toLocaleLowerCase("zh-CN").includes(keyword) ||
          item.sourceFileName?.toLocaleLowerCase("zh-CN").includes(keyword),
      )
    : [...sourceItems.value];

  return filtered.sort((left, right) => {
    switch (sortMode.value) {
      case "updated":
        return right.updatedAt - left.updatedAt;
      case "nameAsc":
        return left.name.localeCompare(right.name, "zh-CN");
      case "nameDesc":
        return right.name.localeCompare(left.name, "zh-CN");
      case "created":
        return right.createdAt - left.createdAt;
      default:
        return right.lastOpenedAt - left.lastOpenedAt;
    }
  });
});

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDate = (timestamp?: number) => {
  if (!timestamp) return "暂无记录";
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `今天 ${new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)}`;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const sourceLabel = (type?: WorkbookFileType) => {
  const labels: Record<WorkbookFileType, string> = {
    xlsx: "XLSX 文件",
    xls: "XLS 文件",
    csv: "CSV 文件",
    local: "本地创建",
    template: "示例模板",
  };
  return type ? labels[type] : "本地创建";
};

const getFileType = (fileName: string): WorkbookFileType => {
  const extension = fileName.split(".").at(-1)?.toLowerCase();
  if (extension === "xlsx" || extension === "xls" || extension === "csv") return extension;
  throw new Error("仅支持 .xlsx、.xls 和 .csv 文件。");
};

const createBudgetSnapshot = (): WorkbookSnapshot => {
  const workbookId = crypto.randomUUID();
  const sheetId = crypto.randomUUID();
  const detailSheetId = crypto.randomUUID();
  const rows = [
    ["2026 年项目预算"],
    ["项目负责人： 张伟", "", "", "编制日期： 2026-07-27"],
    [],
    ["序号", "预算类别", "详细说明", "单价（元）", "数量", "预算金额（元）", "备注"],
    [1, "人员费用", "项目经理", 25000, 1, 25000, "含社保公积金"],
    [2, "人员费用", "开发工程师", 18000, 2, 36000, "中级工程师"],
    [3, "设备采购", "服务器", 12000, 2, 24000, "应用服务器"],
    [4, "软件许可", "数据库许可", 8000, 1, 8000, "年度授权"],
    [5, "外包服务", "UI 设计", 15000, 1, 15000, "含交互设计"],
    [6, "测试服务", "功能测试", 10000, 1, 10000, "第三方测试"],
    [7, "差旅费用", "项目出差", 5000, 1, 5000, "现场支持"],
    [8, "培训费用", "技术培训", 4600, 1, 4600, "团队培训"],
    ["合计", "", "", "", 8, 128600],
  ];
  const cellData = Object.fromEntries(
    rows.map((row, rowIndex) => [
      rowIndex,
      Object.fromEntries(
        row.map((value, columnIndex) => [
          columnIndex,
          {
            v: value,
            s: {
              ...(rowIndex === 0 ? { bl: 1, fs: 16 } : {}),
              ...(rowIndex === 3 || rowIndex === 12 ? { bl: 1, bg: { rgb: "#DCF3E2" } } : {}),
              ...(columnIndex === 3 || columnIndex === 5
                ? {
                    n: {
                      pattern: rowIndex === 12 && columnIndex === 5 ? "¥#,##0" : "#,##0",
                    },
                  }
                : {}),
            },
            ...(rowIndex >= 4 && rowIndex <= 11 && columnIndex === 5
              ? { f: `=D${rowIndex + 1}*E${rowIndex + 1}` }
              : {}),
            ...(rowIndex === 12 && columnIndex === 4 ? { f: "=SUM(E5:E12)" } : {}),
            ...(rowIndex === 12 && columnIndex === 5 ? { f: "=SUM(F5:F12)" } : {}),
          },
        ]),
      ),
    ]),
  );
  const detailRows = [
    ["预算明细"],
    ["费用类别", "责任人", "计划月份", "说明", "预算金额（元）"],
    ["人员费用", "张伟", "2026-08", "项目经理", 25000],
    ["人员费用", "李明", "2026-08", "开发工程师 × 2", 36000],
    ["设备采购", "王芳", "2026-08", "应用服务器 × 2", 24000],
    ["软件许可", "陈晨", "2026-09", "数据库年度授权", 8000],
    ["外包服务", "赵敏", "2026-09", "UI 与交互设计", 15000],
    ["测试服务", "刘洋", "2026-10", "第三方功能测试", 10000],
    ["差旅费用", "张伟", "2026-10", "现场支持", 5000],
    ["培训费用", "李明", "2026-11", "团队技术培训", 4600],
    ["合计", "", "", "", 128600],
  ];
  const detailCellData = Object.fromEntries(
    detailRows.map((row, rowIndex) => [
      rowIndex,
      Object.fromEntries(
        row.map((value, columnIndex) => [
          columnIndex,
          {
            v: value,
            s: {
              ...(rowIndex === 0 ? { bl: 1, fs: 16 } : {}),
              ...(rowIndex === 1 || rowIndex === detailRows.length - 1
                ? { bl: 1, bg: { rgb: "#DCF3E2" } }
                : {}),
              ...(columnIndex === 4 ? { n: { pattern: "#,##0" } } : {}),
            },
            ...(rowIndex === detailRows.length - 1 && columnIndex === 4
              ? { f: "=SUM(E3:E10)" }
              : {}),
          },
        ]),
      ),
    ]),
  );

  return {
    id: workbookId,
    name: "2026 年项目预算",
    appVersion: "0.25.1",
    locale: "zhCN" as WorkbookSnapshot["locale"],
    styles: {},
    sheetOrder: [sheetId, detailSheetId],
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: "Sheet1",
        rowCount: 100,
        columnCount: 26,
        cellData,
        columnData: {
          0: { w: 70 },
          1: { w: 120 },
          2: { w: 145 },
          3: { w: 110 },
          4: { w: 82 },
          5: { w: 130 },
          6: { w: 145 },
        },
      },
      [detailSheetId]: {
        id: detailSheetId,
        name: "预算明细",
        rowCount: 100,
        columnCount: 26,
        cellData: detailCellData,
        columnData: {
          0: { w: 120 },
          1: { w: 100 },
          2: { w: 110 },
          3: { w: 200 },
          4: { w: 140 },
        },
      },
    },
    custom: {
      activeSheetId: sheetId,
    },
  };
};

async function createBlank() {
  if (actionId.value) return;
  actionId.value = "create-blank";
  try {
    const workbook = await workbookStore.createBlank();
    await router.push(`/workbook/${workbook.id}`);
  } catch (error) {
    appStore.pushToast("无法创建工作簿", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    actionId.value = null;
  }
}

async function createBudgetExample() {
  if (actionId.value) return;
  actionId.value = "create-template";
  try {
    const workbook = await workbookStore.createFromSnapshot(
      createBudgetSnapshot(),
      "2026 年项目预算",
      undefined,
      "template",
    );
    await router.push(`/workbook/${workbook.id}`);
  } catch (error) {
    appStore.pushToast("无法创建示例", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    actionId.value = null;
  }
}

async function importFiles(files: FileList | File[]) {
  const file = Array.from(files)[0];
  if (!file || appStore.importActivity.active) return;

  try {
    getFileType(file.name);
    importController.value = new AbortController();
    appStore.beginImport(file);
    const imported = await importService.importFile(file, {
      signal: importController.value.signal,
      onProgress: (progress) => {
        appStore.updateImport(progress.percent, progress.message);
      },
    });
    appStore.updateImport(95, "正在保存到当前浏览器");
    await workbookStore.refresh();
    workbookStore.setCurrent(imported.record);
    importedWorkbookId.value = imported.record.id;
    compatibilityFileName.value = file.name;
    compatibilityReport.value = imported.compatibility;
    compatibilityOpen.value = true;
    appStore.pushToast("导入完成", {
      message: `${file.name} 已保存。请查看兼容性报告后打开。`,
      type: "success",
    });
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof AppError && error.code === "OPERATION_CANCELLED")
    ) {
      appStore.pushToast("已取消导入");
    } else {
      appStore.pushToast("导入失败", {
        message: appStore.errorMessage(error, "请检查文件格式后重试。"),
        type: "error",
        duration: 7000,
      });
    }
  } finally {
    importController.value = null;
    appStore.finishImport();
    if (fileInput.value) fileInput.value.value = "";
  }
}

async function openImportedWorkbook() {
  if (!importedWorkbookId.value) return;
  compatibilityOpen.value = false;
  await router.push(`/workbook/${importedWorkbookId.value}`);
}

function cancelImport() {
  importController.value?.abort();
}

function chooseImportFile() {
  if (!appStore.importActivity.active) fileInput.value?.click();
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  if (event.dataTransfer?.files.length) void importFiles(event.dataTransfer.files);
}

async function openWorkbook(item: WorkbookListItem) {
  if (activeTab.value === "trash") return;
  actionId.value = item.id;
  try {
    await workbookStore.open(item.id);
    await router.push(`/workbook/${item.id}`);
  } catch (error) {
    appStore.pushToast("无法打开工作簿", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    actionId.value = null;
  }
}

function askRename(item: WorkbookListItem) {
  renameTarget.value = item;
  renameValue.value = item.name;
  renameOpen.value = true;
}

async function confirmRename() {
  if (!renameTarget.value) return;
  actionId.value = renameTarget.value.id;
  try {
    await workbookStore.rename(renameTarget.value.id, renameValue.value);
    renameOpen.value = false;
    appStore.pushToast("已重命名", { type: "success" });
  } catch (error) {
    appStore.pushToast("重命名失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    actionId.value = null;
  }
}

async function duplicateWorkbook(item: WorkbookListItem) {
  actionId.value = item.id;
  try {
    const duplicated = await workbookStore.duplicate(item.id);
    appStore.pushToast("副本已创建", {
      message: duplicated.name,
      type: "success",
    });
  } catch (error) {
    appStore.pushToast("创建副本失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    actionId.value = null;
  }
}

function askExportWorkbook(item: WorkbookListItem) {
  exportTarget.value = item;
  xlsxWarningOpen.value = true;
}

async function exportWorkbook(format: "xlsx" | "msheet") {
  const item = exportTarget.value;
  if (!item) return;
  actionId.value = item.id;
  appStore.isExporting = true;
  try {
    const record = await workbookService.get(item.id);
    if (!record) throw new Error("找不到该工作簿。");
    const backup =
      format === "msheet" ? await backupService.createWorkbookBackup(record) : undefined;
    const result = await exportService.exportWorkbook(record.snapshot, {
      format,
      fileName: item.name,
      backup,
    });
    downloadExport(result);
    await workbookService.markExported(item.id);
    await workbookStore.refresh();
    appStore.pushToast("已开始下载", {
      message: result.fileName,
      type: "success",
    });
  } catch (error) {
    appStore.pushToast("导出失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    appStore.isExporting = false;
    actionId.value = null;
    exportTarget.value = null;
  }
}

function askMoveToTrash(item: WorkbookListItem) {
  trashTarget.value = item;
  trashOpen.value = true;
}

async function confirmMoveToTrash() {
  if (!trashTarget.value) return;
  actionId.value = trashTarget.value.id;
  try {
    await workbookStore.moveToTrash(trashTarget.value.id);
    trashOpen.value = false;
    appStore.pushToast("已移入回收站", {
      message: "你可以在回收站中恢复它。",
      type: "success",
    });
  } catch (error) {
    appStore.pushToast("操作失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    actionId.value = null;
  }
}

async function restoreWorkbook(item: WorkbookListItem) {
  actionId.value = item.id;
  try {
    await workbookStore.restore(item.id);
    appStore.pushToast("工作簿已恢复", { type: "success" });
  } catch (error) {
    appStore.pushToast("恢复失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    actionId.value = null;
  }
}

function askDelete(item: WorkbookListItem) {
  deleteTarget.value = item;
  deleteOpen.value = true;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  actionId.value = deleteTarget.value.id;
  try {
    await workbookStore.deletePermanently(deleteTarget.value.id);
    deleteOpen.value = false;
    appStore.pushToast("工作簿已彻底删除", { type: "success" });
  } catch (error) {
    appStore.pushToast("删除失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    actionId.value = null;
  }
}

async function clearAllData() {
  try {
    await workbookStore.clearAll();
    clearAllOpen.value = false;
    appStore.pushToast("本地工作簿数据已清除", { type: "success" });
  } catch (error) {
    appStore.pushToast("清除失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  }
}

onMounted(async () => {
  try {
    await Promise.all([
      workbookStore.refresh(),
      settingsStore.loaded ? Promise.resolve() : settingsStore.load(),
    ]);
  } catch (error) {
    appStore.pushToast("无法读取本地工作簿", {
      message: appStore.errorMessage(error, "请检查浏览器是否允许使用 IndexedDB。"),
      type: "error",
      duration: 7000,
    });
  }
});
</script>

<template>
  <div class="home-page">
    <header class="topbar">
      <AppLogo subtitle="无需登录 · 数据不上传" />
      <RouterLink class="topbar__support-link" to="/settings#support">
        <HandCoins :size="17" />
        捐赠支持
      </RouterLink>
      <nav class="topbar__nav" aria-label="主导航">
        <!-- <a href="#privacy">帮助</a> -->
        <RouterLink to="/settings">
          <Settings :size="18" />
          设置
        </RouterLink>
      </nav>
    </header>

    <main>
      <section class="hero" aria-labelledby="home-title">
        <div class="hero__intro">
          <span class="eyebrow">
            <CheckCircle2 :size="15" />
            文件只留在你的设备
          </span>
          <h1 id="home-title">打开网页，即刻开始编辑</h1>
          <p>创建新工作簿，或打开电脑里的 Excel 文件。无需登录，数据不会上传。</p>
          <div class="hero__actions">
            <button
              class="button button--primary"
              type="button"
              :disabled="Boolean(actionId)"
              @click="createBlank"
            >
              <FilePlus2 :size="19" />
              创建空白表格
            </button>
            <button
              class="button button--secondary"
              type="button"
              :disabled="Boolean(actionId)"
              @click="createBudgetExample"
            >
              <FileSpreadsheet :size="19" />
              项目预算示例
            </button>
          </div>
          <p class="hero__support">支持 .xlsx、.xls、.csv · 建议使用桌面浏览器</p>
        </div>

        <button
          class="dropzone"
          :class="{
            'dropzone--dragging': dragging,
            'dropzone--busy': appStore.importActivity.active,
          }"
          type="button"
          :aria-busy="appStore.importActivity.active"
          @click="chooseImportFile"
          @dragenter.prevent="dragging = true"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <template v-if="!appStore.importActivity.active">
            <span class="dropzone__icon"><Upload :size="26" :stroke-width="1.7" /></span>
            <strong>拖入或选择本地文件</strong>
            <span>文件将在此浏览器中解析和保存</span>
            <span class="dropzone__link">选择文件</span>
          </template>
          <template v-else>
            <span class="dropzone__icon dropzone__icon--loading">
              <FileSpreadsheet :size="26" :stroke-width="1.7" />
            </span>
            <strong class="dropzone__filename">{{ appStore.importActivity.fileName }}</strong>
            <span>
              {{ formatBytes(appStore.importActivity.fileSize) }} ·
              {{ appStore.importActivity.stage }}
            </span>
            <span class="progress" aria-label="导入进度">
              <span
                :style="{
                  width:
                    appStore.importActivity.progress === null
                      ? '38%'
                      : `${appStore.importActivity.progress}%`,
                }"
              />
            </span>
            <span class="dropzone__link" @click.stop="cancelImport">取消导入</span>
          </template>
        </button>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept=".xlsx,.xls,.csv"
          @change="
            ($event.target as HTMLInputElement).files &&
            importFiles(($event.target as HTMLInputElement).files!)
          "
        />
      </section>

      <section class="library" aria-labelledby="library-title">
        <div class="library__heading">
          <div>
            <h2 id="library-title">{{ activeTab === "recent" ? "最近使用" : "回收站" }}</h2>
            <p>
              {{
                activeTab === "recent"
                  ? `${workbookStore.workbooks.length} 个保存在此浏览器的工作簿`
                  : "回收站中的工作簿仍占用本地存储空间"
              }}
            </p>
          </div>
          <div class="library__tabs" role="tablist" aria-label="工作簿分类">
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'recent'"
              :class="{ active: activeTab === 'recent' }"
              @click="activeTab = 'recent'"
            >
              最近使用
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'trash'"
              :class="{ active: activeTab === 'trash' }"
              @click="activeTab = 'trash'"
            >
              回收站
              <span v-if="workbookStore.trashedWorkbooks.length">
                {{ workbookStore.trashedWorkbooks.length }}
              </span>
            </button>
          </div>
        </div>

        <div class="library__toolbar">
          <label class="search-field">
            <Search :size="18" />
            <span class="visually-hidden">搜索工作簿</span>
            <input v-model="query" type="search" placeholder="搜索工作簿或原始文件名" />
            <button v-if="query" type="button" aria-label="清除搜索" @click="query = ''">
              <X :size="16" />
            </button>
          </label>
          <label class="sort-field">
            <ArrowDownAZ v-if="sortMode !== 'nameDesc'" :size="18" />
            <ArrowUpAZ v-else :size="18" />
            <span class="visually-hidden">排序方式</span>
            <select v-model="sortMode">
              <option value="lastOpened">最近打开</option>
              <option value="updated">最近修改</option>
              <option value="nameAsc">名称 A–Z</option>
              <option value="nameDesc">名称 Z–A</option>
              <option value="created">创建时间</option>
            </select>
          </label>
          <button
            class="text-button text-button--danger"
            type="button"
            @click="clearAllOpen = true"
          >
            <Trash2 :size="16" />
            清除全部数据
          </button>
        </div>

        <div v-if="workbookStore.loading" class="skeleton-grid" aria-label="正在读取工作簿">
          <span v-for="index in 4" :key="index" />
        </div>

        <div v-else-if="visibleItems.length" class="workbook-grid">
          <article v-for="item in visibleItems" :key="item.id" class="workbook-card">
            <button
              class="workbook-card__preview"
              :disabled="activeTab === 'trash' || actionId === item.id"
              type="button"
              :aria-label="activeTab === 'trash' ? item.name : `打开 ${item.name}`"
              @click="openWorkbook(item)"
            >
              <span class="sheet-preview" aria-hidden="true">
                <span class="sheet-preview__title" />
                <span class="sheet-preview__header" />
                <span v-for="index in 12" :key="index" class="sheet-preview__cell" />
              </span>
              <span v-if="item.hasLocalChanges && activeTab === 'recent'" class="local-change">
                本地有修改
              </span>
            </button>
            <div class="workbook-card__body">
              <div class="workbook-card__title-row">
                <div>
                  <h3 :title="item.name">{{ item.name }}</h3>
                  <p :title="item.sourceFileName">
                    {{ item.sourceFileName || sourceLabel(item.sourceFileType) }}
                  </p>
                </div>
                <MoreHorizontal :size="19" aria-hidden="true" />
              </div>
              <dl>
                <div>
                  <dt><Clock3 :size="14" />{{ activeTab === "recent" ? "打开" : "删除" }}</dt>
                  <dd>
                    {{ formatDate(activeTab === "recent" ? item.lastOpenedAt : item.deletedAt) }}
                  </dd>
                </div>
                <div>
                  <dt><CalendarDays :size="14" />保存</dt>
                  <dd>{{ formatDate(item.updatedAt) }}</dd>
                </div>
              </dl>
              <div class="workbook-card__meta">
                <span>{{ item.sheetCount }} 个工作表</span>
                <span>{{ sourceLabel(item.sourceFileType) }}</span>
              </div>
            </div>
            <div v-if="activeTab === 'recent'" class="workbook-card__actions">
              <button
                type="button"
                title="重命名"
                :disabled="actionId === item.id"
                @click="askRename(item)"
              >
                <Pencil :size="16" />
                <span>重命名</span>
              </button>
              <button
                type="button"
                title="创建副本"
                :disabled="actionId === item.id"
                @click="duplicateWorkbook(item)"
              >
                <Copy :size="16" />
                <span>复制</span>
              </button>
              <button
                type="button"
                title="导出为 XLSX"
                :disabled="actionId === item.id"
                @click="askExportWorkbook(item)"
              >
                <Download :size="16" />
                <span>导出</span>
              </button>
              <button
                class="danger"
                type="button"
                title="移入回收站"
                :disabled="actionId === item.id"
                @click="askMoveToTrash(item)"
              >
                <Trash2 :size="16" />
                <span>删除</span>
              </button>
            </div>
            <div v-else class="workbook-card__actions workbook-card__actions--trash">
              <button type="button" :disabled="actionId === item.id" @click="restoreWorkbook(item)">
                <RotateCcw :size="16" />
                恢复
              </button>
              <button
                class="danger"
                type="button"
                :disabled="actionId === item.id"
                @click="askDelete(item)"
              >
                <Trash2 :size="16" />
                彻底删除
              </button>
            </div>
          </article>
        </div>

        <div v-else class="empty-state">
          <span><FolderOpen :size="26" :stroke-width="1.6" /></span>
          <h3>
            {{
              query
                ? "没有找到匹配的工作簿"
                : activeTab === "recent"
                  ? "还没有本地工作簿"
                  : "回收站是空的"
            }}
          </h3>
          <p v-if="query">换个名称或原始文件名试试。</p>
          <p v-else-if="activeTab === 'recent'">创建空白表格，或从电脑打开一个文件。</p>
          <p v-else>移入回收站的工作簿会显示在这里。</p>
          <button
            v-if="activeTab === 'recent' && !query"
            class="button button--primary button--small"
            type="button"
            @click="createBlank"
          >
            <FilePlus2 :size="17" />
            创建表格
          </button>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="site-footer__inner">
        <section class="site-footer__brand" aria-label="产品信息">
          <AppLogo subtitle="无需登录 · 数据不上传" />
          <p>无需登录，工作簿与文件仅在当前设备处理。</p>
          <span class="site-footer__trust">
            <ShieldCheck :size="16" />
            本地处理 · 数据不上传
          </span>
        </section>

        <nav class="site-footer__links" aria-label="页脚导航">
          <div class="site-footer__link-group">
            <strong>在线 Excel 处理</strong>
            <RouterLink to="/settings">本地数据与设置</RouterLink>
            <RouterLink to="/settings#privacy">隐私与安全</RouterLink>
            <RouterLink to="/settings#support">捐赠支持</RouterLink>
          </div>

          <div class="site-footer__link-group">
            <strong>更多工具</strong>
            <a
              class="site-footer__product-link"
              href="https://pdf.meowv.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText :size="18" aria-hidden="true" />
              <span>
                <b>在线 PDF 处理</b>
                <small>浏览器里的本地 PDF 工具</small>
              </span>
              <ArrowUpRight :size="15" aria-hidden="true" />
            </a>
            <a
              class="site-footer__product-link"
              href="https://zt.meowv.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <SquarePen :size="18" aria-hidden="true" />
              <span>
                <b>字帖生成</b>
                <small>在线制作 A4 练字纸</small>
              </span>
              <ArrowUpRight :size="15" aria-hidden="true" />
            </a>
          </div>
        </nav>
      </div>
    </footer>

    <ConfirmDialog
      v-model:open="renameOpen"
      v-model:input-value="renameValue"
      title="重命名工作簿"
      description="新名称会立即保存到当前浏览器。"
      input-label="工作簿名称"
      input-placeholder="请输入工作簿名称"
      confirm-label="保存"
      require-non-empty
      @confirm="confirmRename"
    />
    <ConfirmDialog
      v-model:open="trashOpen"
      title="移入回收站？"
      :description="`“${trashTarget?.name ?? ''}”可从回收站恢复。`"
      confirm-label="移入回收站"
      dangerous
      @confirm="confirmMoveToTrash"
    />
    <ConfirmDialog
      v-model:open="deleteOpen"
      title="彻底删除工作簿？"
      :description="`“${deleteTarget?.name ?? ''}”删除后无法恢复。`"
      confirm-label="彻底删除"
      dangerous
      @confirm="confirmDelete"
    />
    <ConfirmDialog
      v-model:open="clearAllOpen"
      title="清除全部本地数据？"
      description="所有工作簿（包括回收站内容）都将从当前浏览器永久删除，此操作无法撤销。"
      confirm-label="清除全部数据"
      required-text="清除"
      dangerous
      @confirm="clearAllData"
    />
    <CompatibilityDialog
      v-model:open="compatibilityOpen"
      :file-name="compatibilityFileName"
      :report="compatibilityReport"
      @open-workbook="openImportedWorkbook"
    />
    <XlsxExportWarningDialog
      v-model:open="xlsxWarningOpen"
      @backup="exportWorkbook('msheet')"
      @confirm="exportWorkbook('xlsx')"
    />
    <ToastRegion :toasts="appStore.toasts" @dismiss="appStore.dismissToast" />
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100dvh;
  background: var(--surface);
  color: var(--text-strong);
}

.topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: grid;
  height: 68px;
  grid-template-columns: minmax(210px, 1fr) auto minmax(210px, 1fr);
  align-items: center;
  padding: 0 clamp(24px, 4vw, 64px);
  border-bottom: 1px solid var(--border);
  background: var(--surface-translucent);
}

.topbar__support-link {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid var(--primary-border);
  border-radius: 6px;
  background: var(--primary-surface);
  color: var(--primary-text);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
}

.topbar__support-link:hover {
  background: var(--primary-surface-strong);
}

.topbar__nav {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.topbar__nav a {
  display: inline-flex;
  height: 38px;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border-radius: 6px;
  color: var(--text);
  font-size: 14px;
  font-weight: 550;
  text-decoration: none;
}

.topbar__nav a:hover {
  background: var(--surface-muted);
  color: var(--text-strong);
}

.topbar__support-link:focus-visible,
.topbar__nav a:focus-visible,
.button:focus-visible,
.dropzone:focus-visible,
.library button:focus-visible,
.library input:focus-visible,
.library select:focus-visible {
  outline: 3px solid rgb(22 163 74 / 18%);
  outline-offset: 2px;
}

main {
  width: min(1260px, calc(100% - 48px));
  margin: 0 auto;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(380px, 0.92fr);
  gap: clamp(48px, 7vw, 96px);
  align-items: center;
  min-height: 424px;
  padding: 66px 36px;
}

.hero__intro {
  max-width: 650px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 17px;
  color: var(--primary-text);
  font-size: 13px;
  font-weight: 650;
}

.hero h1 {
  max-width: 620px;
  margin: 0;
  color: var(--text-strong);
  font-size: clamp(36px, 4vw, 52px);
  font-weight: 720;
  line-height: 1.14;
  letter-spacing: -0.035em;
}

.hero__intro > p {
  max-width: 580px;
  margin: 20px 0 0;
  color: var(--text-secondary);
  font-size: 17px;
  line-height: 1.8;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 29px;
}

.button {
  display: inline-flex;
  height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 18px;
  border: 1px solid transparent;
  border-radius: 6px;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}

.button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.button--primary {
  border-color: var(--primary-600);
  background: var(--primary-600);
  color: var(--on-accent);
}

.button--primary:hover:not(:disabled) {
  border-color: var(--primary-700);
  background: var(--primary-700);
}

.button--secondary {
  border-color: var(--border-strong);
  background: var(--surface);
  color: var(--text);
}

.button--secondary:hover:not(:disabled) {
  border-color: var(--border-emphasis);
  background: var(--app-bg);
}

.button--small {
  height: 38px;
  margin-top: 9px;
  padding: 0 14px;
}

.hero__support {
  margin-top: 14px !important;
  color: var(--text-tertiary) !important;
  font-size: 12px !important;
}

.dropzone {
  display: flex;
  min-height: 246px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px;
  border: 1px dashed var(--border-emphasis);
  border-radius: 10px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background 150ms ease;
}

.dropzone:hover,
.dropzone--dragging {
  border-color: var(--primary-600);
  background: var(--primary-surface);
}

.dropzone--busy {
  cursor: default;
}

.dropzone__icon {
  display: grid;
  width: 52px;
  height: 52px;
  margin-bottom: 15px;
  border: 1px solid var(--primary-border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--primary-text);
  place-items: center;
}

.dropzone strong {
  max-width: 100%;
  overflow: hidden;
  color: var(--text);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropzone > span:not(.dropzone__icon, .dropzone__link, .progress) {
  margin-top: 5px;
  font-size: 13px;
}

.dropzone__link {
  margin-top: 17px;
  color: var(--primary-text);
  font-size: 14px;
  font-weight: 650;
}

.progress {
  width: min(260px, 86%);
  height: 5px;
  margin-top: 16px;
  overflow: hidden;
  border-radius: 9px;
  background: var(--surface-pressed);
}

.progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--primary-600);
  transition: width 180ms ease;
}

.library {
  padding: 38px 0 66px;
  border-top: 1px solid var(--border);
}

.library__heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.library h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: 24px;
  font-weight: 690;
  letter-spacing: -0.02em;
}

.library__heading p {
  margin: 6px 0 0;
  color: var(--text-tertiary);
  font-size: 13px;
}

.library__tabs {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 7px;
  background: var(--surface-hover);
}

.library__tabs button {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 13px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.library__tabs button.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgb(20 34 25 / 9%);
}

.library__tabs button span {
  display: grid;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: 10px;
  background: var(--surface-pressed);
  font-size: 11px;
  place-items: center;
}

.library__toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 420px) 175px 1fr;
  gap: 10px;
  margin: 24px 0;
}

.search-field,
.sort-field {
  display: flex;
  height: 40px;
  align-items: center;
  gap: 9px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-tertiary);
}

.search-field:focus-within,
.sort-field:focus-within {
  border-color: var(--primary-600);
  box-shadow: 0 0 0 3px rgb(22 163 74 / 10%);
}

.search-field input,
.sort-field select {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.search-field button {
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  place-items: center;
}

.sort-field select {
  cursor: pointer;
}

.text-button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-self: end;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.text-button--danger:hover {
  color: var(--danger-text);
}

.workbook-grid,
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.workbook-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.workbook-card:hover {
  border-color: var(--border-emphasis);
  box-shadow: 0 7px 22px rgb(20 35 26 / 7%);
}

.workbook-card__preview {
  position: relative;
  display: block;
  width: 100%;
  height: 138px;
  padding: 17px 19px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface-muted);
  cursor: pointer;
}

.workbook-card__preview:disabled {
  cursor: default;
}

.sheet-preview {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: 20px 16px repeat(3, 1fr);
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface);
}

.sheet-preview__title {
  grid-column: 1 / -1;
  border-bottom: 1px solid var(--border);
}

.sheet-preview__title::after {
  display: block;
  width: 34%;
  height: 5px;
  margin: 7px 7px;
  border-radius: 2px;
  background: var(--text);
  content: "";
}

.sheet-preview__header {
  grid-column: 1 / -1;
  border-bottom: 1px solid var(--primary-border);
  background: var(--primary-surface-strong);
}

.sheet-preview__cell {
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.local-change {
  position: absolute;
  right: 10px;
  bottom: 9px;
  padding: 3px 7px;
  border: 1px solid var(--primary-border);
  border-radius: 10px;
  background: var(--primary-surface);
  color: var(--primary-text);
  font-size: 10px;
  font-weight: 650;
}

.workbook-card__body {
  padding: 15px 16px 13px;
}

.workbook-card__title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 9px;
}

.workbook-card h3 {
  overflow: hidden;
  margin: 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 660;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbook-card__title-row p {
  overflow: hidden;
  margin: 3px 0 0;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbook-card__title-row > svg {
  color: var(--text-disabled);
}

.workbook-card dl {
  display: grid;
  gap: 5px;
  margin: 13px 0 11px;
}

.workbook-card dl > div {
  display: grid;
  grid-template-columns: 65px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
}

.workbook-card dt,
.workbook-card dd {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.4;
}

.workbook-card dt {
  display: flex;
  align-items: center;
  gap: 5px;
}

.workbook-card dd {
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbook-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  color: var(--text-tertiary);
  font-size: 10px;
}

.workbook-card__actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--border);
}

.workbook-card__actions button {
  display: flex;
  height: 38px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 5px;
  border: 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.workbook-card__actions button:last-child {
  border-right: 0;
}

.workbook-card__actions button:hover {
  background: var(--surface-muted);
  color: var(--primary-text);
}

.workbook-card__actions button:disabled {
  color: var(--text-disabled);
  cursor: wait;
}

.workbook-card__actions button.danger:hover {
  background: var(--danger-surface);
  color: var(--danger-text);
}

.workbook-card__actions--trash {
  grid-template-columns: 1fr 1fr;
}

.skeleton-grid span {
  height: 320px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  animation: pulse 1.4s ease-in-out infinite alternate;
}

@keyframes pulse {
  to {
    background: var(--surface-pressed);
  }
}

.empty-state {
  display: grid;
  min-height: 270px;
  place-items: center;
  align-content: center;
  padding: 36px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  background: var(--surface-subtle);
  text-align: center;
}

.empty-state > span {
  display: grid;
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-tertiary);
  place-items: center;
}

.empty-state h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.empty-state p {
  margin: 6px 0 8px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.site-footer {
  border-top: 1px solid var(--border);
  background: var(--surface-subtle);
}

.site-footer__inner {
  width: min(1180px, calc(100% - 48px));
  margin: 0 auto;
}

.site-footer__inner {
  display: grid;
  grid-template-columns: minmax(260px, 0.72fr) minmax(480px, 1.28fr);
  gap: clamp(64px, 9vw, 130px);
  padding: 57px 0 46px;
}

.site-footer__brand {
  align-content: start;
}

.site-footer__brand p {
  max-width: 330px;
  margin: 17px 0 13px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.site-footer__trust {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--primary-text-soft);
  font-size: 12px;
  font-weight: 680;
}

.site-footer__links {
  display: grid;
  grid-template-columns: minmax(130px, 0.5fr) minmax(250px, 1fr);
  gap: clamp(44px, 7vw, 84px);
}

.site-footer__link-group {
  display: grid;
  align-content: start;
  gap: 9px;
}

.site-footer__link-group > strong {
  margin-bottom: 5px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.site-footer__link-group > a {
  width: fit-content;
  color: var(--text-tertiary);
  font-size: 12px;
  text-decoration: none;
}

.site-footer__link-group > a:hover {
  color: var(--primary-text);
}

.site-footer__link-group .site-footer__product-link {
  display: grid;
  width: 100%;
  max-width: 320px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
}

.site-footer__product-link > svg:first-child {
  color: var(--primary-text-soft);
}

.site-footer__product-link > svg:last-child {
  color: var(--text-tertiary);
  transition: transform 150ms ease;
}

.site-footer__product-link:hover > svg:last-child {
  transform: translate(2px, -2px);
}

.site-footer__product-link > span {
  display: grid;
  gap: 1px;
}

.site-footer__product-link b {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 680;
}

.site-footer__product-link small {
  color: var(--text-tertiary);
  font-size: 10px;
}

.visually-hidden {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip: rect(1px, 1px, 1px, 1px) !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
}

@media (max-width: 1040px) {
  .hero {
    grid-template-columns: 1fr 380px;
    gap: 34px;
    padding-inline: 0;
  }

  .workbook-grid,
  .skeleton-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .site-footer__inner {
    grid-template-columns: minmax(220px, 0.65fr) minmax(430px, 1.35fr);
    gap: 40px;
  }
}

@media (max-width: 820px) {
  .topbar {
    padding: 0 20px;
  }

  main {
    width: min(100% - 32px, 680px);
  }

  .hero {
    grid-template-columns: 1fr;
    gap: 34px;
    padding: 48px 0;
  }

  .hero h1 {
    font-size: clamp(34px, 9vw, 46px);
  }

  .dropzone {
    min-height: 220px;
  }

  .library__heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .library__toolbar {
    grid-template-columns: 1fr 170px;
  }

  .text-button {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .workbook-grid,
  .skeleton-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .site-footer__inner {
    width: min(100% - 30px, 680px);
  }

  .site-footer__inner {
    grid-template-columns: 1fr;
    gap: 43px;
    padding-top: 48px;
  }

  .site-footer__links {
    grid-template-columns: minmax(105px, 0.55fr) minmax(210px, 1fr);
    gap: 30px;
  }
}

@media (max-width: 540px) {
  .topbar {
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
    padding: 0 16px;
  }

  .topbar :deep(.app-logo__copy) {
    display: none;
  }

  .topbar__support-link {
    width: 38px;
    padding: 0;
    justify-content: center;
    font-size: 0;
  }

  .topbar__nav a:first-child {
    display: none;
  }

  .topbar__nav a {
    width: 38px;
    padding: 0;
    justify-content: center;
    font-size: 0;
  }

  .hero {
    padding-top: 38px;
  }

  .hero__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .library__toolbar {
    grid-template-columns: 1fr;
  }

  .text-button {
    grid-column: auto;
  }

  .workbook-grid,
  .skeleton-grid {
    grid-template-columns: 1fr;
  }

  .site-footer__links {
    grid-template-columns: 1fr;
    gap: 31px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dropzone,
  .workbook-card,
  .progress > span,
  .site-footer__product-link,
  .site-footer__product-link svg {
    transition: none;
  }

  .skeleton-grid span {
    animation: none;
  }
}
</style>
