<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import {
  IconArrowLeft,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconFileSpreadsheet,
  IconFileText,
  IconFolderOpen,
  IconGripHorizontal,
  IconHistory,
  IconPresentation,
  IconTable,
  IconTrash,
} from '@tabler/icons-vue';
import { handoffFile, receiveWindowFileHandoff, useFileHandoff } from '@/core/browser/file-handoff';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import { workspaceActive, workspaceHeaderVisible } from '@/core/shared/route-state';
import type { RecentDocument } from './runtime/lib/recent-documents';
import {
  createOfficeDocument,
  deleteOfficeRecentDocument,
  disposeOfficeRuntime,
  hasUnsavedOfficeChanges,
  loadActiveOfficeFile,
  loadRecentOfficeDocuments,
  loadRecentOfficeFile,
  officeFormatForRoute,
  OFFICE_FORMATS,
  OFFICE_ROUTE_FORMATS,
  openOfficeFile,
  routeFormatForFileName,
  type OfficeFormat,
} from './runtime/office-controller';
import type { OfficeRouteFormat } from './runtime/lib/active-documents';
import './office.css';

const route = useRoute();
const router = useRouter();
const { takeHandoff } = useFileHandoff();
const fileInput = ref<HTMLInputElement | null>(null);
const workspaceElement = ref<HTMLElement | null>(null);
const workspaceMenuElement = ref<HTMLElement | null>(null);
const isWorkspace = ref(false);
const isFullscreen = ref(false);
const isMenuDragging = ref(false);
const busy = ref(false);
const error = ref('');
const stage = ref('本地编辑器待命');
const fileName = ref('');
const recentDocuments = ref<RecentDocument[]>([]);
const isFileDragging = ref(false);
const fileDragDepth = ref(0);
const menuPosition = ref<{ left: number; top: number } | null>(null);
let menuDrag:
  | {
      pointerId?: number;
      offsetLeft: number;
      offsetTop: number;
      width: number;
      height: number;
    }
  | undefined;
let stopWindowFileHandoff: () => void = () => undefined;

const MENU_POSITION_STORAGE_KEY = `${STORAGE_POLICY.namespace('office')}:editor-menu-position`;

type OfficeOpenPicker = (options: {
  multiple: false;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<RecentDocument['handle'][]>;

watch(isWorkspace, (active) => {
  workspaceActive.value = active;
  workspaceHeaderVisible.value = !active;
});

const requestedRouteFormat = computed<OfficeRouteFormat | null>(() => {
  const format = typeof route.params.format === 'string' ? route.params.format.toLowerCase() : '';
  return OFFICE_ROUTE_FORMATS.includes(format as OfficeRouteFormat)
    ? (format as OfficeRouteFormat)
    : null;
});

const requestedFormat = computed<OfficeFormat | null>(() =>
  requestedRouteFormat.value ? officeFormatForRoute(requestedRouteFormat.value) : null,
);

const formatCards: Array<{
  format: OfficeFormat;
  routeFormat: OfficeRouteFormat;
  label: string;
  title: string;
  description: string;
  icon: typeof IconFileText;
  tone: string;
}> = [
  {
    format: 'docx',
    routeFormat: 'doc',
    label: 'DOCX',
    title: '文字文档',
    description: '撰写、排版与审阅 Word 文档',
    icon: IconFileText,
    tone: 'blue',
  },
  {
    format: 'xlsx',
    routeFormat: 'xls',
    label: 'XLSX',
    title: '电子表格',
    description: '公式、图表与多工作表编辑',
    icon: IconFileSpreadsheet,
    tone: 'green',
  },
  {
    format: 'pptx',
    routeFormat: 'ppt',
    label: 'PPTX',
    title: '演示文稿',
    description: '创建与整理本地幻灯片',
    icon: IconPresentation,
    tone: 'orange',
  },
  {
    format: 'csv',
    routeFormat: 'csv',
    label: 'CSV',
    title: '数据表格',
    description: '以表格方式编辑纯文本数据',
    icon: IconTable,
    tone: 'violet',
  },
];

function formatSize(size: number): string {
  if (!size) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

function extensionOf(name: string): OfficeFormat | null {
  const extension = name.split('.').pop()?.toLowerCase();
  return OFFICE_FORMATS.includes(extension as OfficeFormat) ? (extension as OfficeFormat) : null;
}

const loadingFormat = computed<OfficeFormat>(() => extensionOf(fileName.value) || 'docx');
const menuPositionStyle = computed(() =>
  menuPosition.value
    ? { left: `${menuPosition.value.left}px`, top: `${menuPosition.value.top}px`, right: 'auto' }
    : undefined,
);

async function refreshRecent(): Promise<void> {
  recentDocuments.value = await loadRecentOfficeDocuments();
}

async function runInWorkspace(name: string, action: () => Promise<void>): Promise<void> {
  error.value = '';
  busy.value = true;
  stage.value = '正在准备本地运行时…';
  fileName.value = name;
  isWorkspace.value = true;
  await nextTick();
  try {
    await action();
    stage.value = '已打开';
  } catch (reason) {
    disposeOfficeRuntime();
    isWorkspace.value = false;
    error.value = reason instanceof Error ? reason.message : '文档打开失败，请重试。';
  } finally {
    busy.value = false;
  }
}

async function openFile(file: File, handle?: RecentDocument['handle']): Promise<void> {
  const routeFormat = routeFormatForFileName(file.name);
  if (!routeFormat) {
    error.value = '仅支持 DOCX、XLSX、PPTX 与 CSV 文件。';
    return;
  }
  if (requestedRouteFormat.value !== routeFormat) {
    handoffFile(file, 'office', handle as FileSystemFileHandle | undefined);
    await router.push(`/office/${routeFormat}`);
    return;
  }
  await runInWorkspace(file.name, () =>
    openOfficeFile(file, {
      handle,
      routeFormat,
      onStage: (message) => {
        stage.value = message;
      },
    }),
  );
}

async function createDocument(format: OfficeFormat, routeFormat: OfficeRouteFormat): Promise<void> {
  const names: Record<OfficeFormat, string> = {
    docx: '新建文档.docx',
    xlsx: '新建工作簿.xlsx',
    pptx: '新建演示文稿.pptx',
    csv: '新建表格.csv',
  };
  await runInWorkspace(names[format], () =>
    createOfficeDocument(
      format,
      (message) => {
        stage.value = message;
      },
      routeFormat,
    ),
  );
}

async function openFormat(routeFormat: OfficeRouteFormat): Promise<void> {
  await router.push(`/office/${routeFormat}`);
}

async function openRecent(record: RecentDocument): Promise<void> {
  try {
    const { file, handle } = await loadRecentOfficeFile(record);
    await openFile(file, handle);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '本地文件访问权限不可用。';
  }
}

function recentIcon(extension: string): typeof IconFileText {
  switch (extension.toLowerCase()) {
    case 'xlsx':
      return IconFileSpreadsheet;
    case 'pptx':
      return IconPresentation;
    case 'csv':
      return IconTable;
    default:
      return IconFileText;
  }
}

async function openFileHandle(handle: NonNullable<RecentDocument['handle']>): Promise<void> {
  await handle.requestPermission?.({ mode: 'readwrite' });
  await openFile(await handle.getFile(), handle);
}

async function chooseFile(): Promise<void> {
  error.value = '';
  const picker = (
    window as Window &
      typeof globalThis & {
        showOpenFilePicker?: OfficeOpenPicker;
      }
  ).showOpenFilePicker;
  if (!picker) {
    fileInput.value?.click();
    return;
  }

  try {
    const [handle] = await picker({
      multiple: false,
      types: [
        {
          description: 'Office 文档',
          accept: {
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
            'text/csv': ['.csv'],
          },
        },
      ],
    });
    if (handle) await openFileHandle(handle as unknown as NonNullable<RecentDocument['handle']>);
  } catch (reason) {
    if ((reason as DOMException).name !== 'AbortError') {
      error.value = reason instanceof Error ? reason.message : '无法打开本地文件。';
    }
  }
}

function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function handleFileDragEnter(event: DragEvent): void {
  if (!isFileDrag(event)) return;
  fileDragDepth.value += 1;
  isFileDragging.value = true;
}

function handleFileDragLeave(event: DragEvent): void {
  if (!isFileDrag(event)) return;
  fileDragDepth.value = Math.max(0, fileDragDepth.value - 1);
  if (!fileDragDepth.value) isFileDragging.value = false;
}

async function handleFileDrop(event: DragEvent): Promise<void> {
  fileDragDepth.value = 0;
  isFileDragging.value = false;
  const item = event.dataTransfer?.items?.[0] as
    | (DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<RecentDocument['handle']>;
      })
    | null;
  const handle = await item?.getAsFileSystemHandle?.();
  if (handle) {
    await openFileHandle(handle as NonNullable<RecentDocument['handle']>);
    return;
  }
  const file = event.dataTransfer?.files?.[0];
  if (file) await openFile(file);
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void openFile(file);
}

function syncFullscreenState(): void {
  isFullscreen.value = document.fullscreenElement === workspaceElement.value;
}

function clampMenuPosition(left: number, top: number, width = 48, height = 145) {
  return {
    left: Math.min(Math.max(0, left), Math.max(0, window.innerWidth - width)),
    top: Math.min(Math.max(0, top), Math.max(0, window.innerHeight - height)),
  };
}

function restoreMenuPosition(): void {
  if (!storageAvailable()) return;
  try {
    const saved = JSON.parse(localStorage.getItem(MENU_POSITION_STORAGE_KEY) || 'null') as {
      left?: unknown;
      top?: unknown;
    } | null;
    if (typeof saved?.left === 'number' && typeof saved.top === 'number') {
      menuPosition.value = clampMenuPosition(saved.left, saved.top);
    }
  } catch {
    // 菜单位置仅是本地界面偏好，读取失败时使用默认位置。
  }
}

function saveMenuPosition(): void {
  if (!storageAvailable() || !menuPosition.value) return;
  try {
    localStorage.setItem(MENU_POSITION_STORAGE_KEY, JSON.stringify(menuPosition.value));
  } catch {
    // 存储不可用不影响菜单继续使用。
  }
}

function startMenuDrag(event: PointerEvent): void {
  if (event.button !== 0) return;
  if (menuDrag) return;
  const menu = workspaceMenuElement.value;
  if (!menu) return;
  const bounds = menu.getBoundingClientRect();
  menuDrag = {
    pointerId: event.pointerId,
    offsetLeft: event.clientX - bounds.left,
    offsetTop: event.clientY - bounds.top,
    width: bounds.width,
    height: bounds.height,
  };
  isMenuDragging.value = true;
  window.addEventListener('pointermove', moveMenu);
  window.addEventListener('pointerup', endMenuDrag);
  window.addEventListener('pointercancel', endMenuDrag);
}

function updateMenuPosition(clientX: number, clientY: number): void {
  if (!menuDrag) return;
  menuPosition.value = clampMenuPosition(
    clientX - menuDrag.offsetLeft,
    clientY - menuDrag.offsetTop,
    menuDrag.width,
    menuDrag.height,
  );
}

function moveMenu(event: PointerEvent): void {
  if (!menuDrag || event.pointerId !== menuDrag.pointerId) return;
  updateMenuPosition(event.clientX, event.clientY);
}

function endMenuDrag(event: PointerEvent): void {
  if (!menuDrag || event.pointerId !== menuDrag.pointerId) return;
  menuDrag = undefined;
  isMenuDragging.value = false;
  window.removeEventListener('pointermove', moveMenu);
  window.removeEventListener('pointerup', endMenuDrag);
  window.removeEventListener('pointercancel', endMenuDrag);
  saveMenuPosition();
}

function startMenuMouseDrag(event: MouseEvent): void {
  if (event.button !== 0 || menuDrag) return;
  const menu = workspaceMenuElement.value;
  if (!menu) return;
  const bounds = menu.getBoundingClientRect();
  menuDrag = {
    offsetLeft: event.clientX - bounds.left,
    offsetTop: event.clientY - bounds.top,
    width: bounds.width,
    height: bounds.height,
  };
  isMenuDragging.value = true;
  window.addEventListener('mousemove', moveMenuWithMouse);
  window.addEventListener('mouseup', endMenuMouseDrag);
}

function moveMenuWithMouse(event: MouseEvent): void {
  if (!menuDrag || menuDrag.pointerId !== undefined) return;
  updateMenuPosition(event.clientX, event.clientY);
}

function endMenuMouseDrag(): void {
  if (!menuDrag || menuDrag.pointerId !== undefined) return;
  menuDrag = undefined;
  isMenuDragging.value = false;
  window.removeEventListener('mousemove', moveMenuWithMouse);
  window.removeEventListener('mouseup', endMenuMouseDrag);
  window.removeEventListener('pointermove', moveMenu);
  window.removeEventListener('pointerup', endMenuDrag);
  window.removeEventListener('pointercancel', endMenuDrag);
  saveMenuPosition();
}

function keepMenuInViewport(): void {
  if (!menuPosition.value) return;
  const bounds = workspaceMenuElement.value?.getBoundingClientRect();
  menuPosition.value = clampMenuPosition(
    menuPosition.value.left,
    menuPosition.value.top,
    bounds?.width,
    bounds?.height,
  );
}

async function toggleFullscreen(): Promise<void> {
  const workspace = workspaceElement.value;
  if (!workspace) return;
  try {
    if (document.fullscreenElement === workspace) await document.exitFullscreen();
    else await workspace.requestFullscreen();
  } catch {
    // 全屏 API 受浏览器策略或嵌入环境限制时，保留当前编辑状态。
  }
}

function toggleWorkspaceHeader(): void {
  workspaceHeaderVisible.value = !workspaceHeaderVisible.value;
}

async function closeWorkspace(): Promise<void> {
  if (hasUnsavedOfficeChanges() && !window.confirm('当前文档有未保存修改，确定返回工作台吗？'))
    return;
  if (document.fullscreenElement === workspaceElement.value) await document.exitFullscreen();
  disposeOfficeRuntime();
  isWorkspace.value = false;
  fileName.value = '';
  stage.value = '本地编辑器待命';
  await router.replace('/office');
  await refreshRecent();
}

async function removeRecent(id: string): Promise<void> {
  if (!window.confirm('从历史记录中删除此文件？不会删除电脑上的原文件。')) return;
  await deleteOfficeRecentDocument(id);
  await refreshRecent();
}

onMounted(async () => {
  document.addEventListener('fullscreenchange', syncFullscreenState);
  window.addEventListener('resize', keepMenuInViewport);
  restoreMenuPosition();
  await refreshRecent();
  const handoff = takeHandoff('office');
  if (handoff) {
    await openFile(handoff.file, handoff.handle as RecentDocument['handle']);
  } else if (requestedRouteFormat.value) {
    const activeDocument = await loadActiveOfficeFile(requestedRouteFormat.value);
    if (activeDocument) {
      await openFile(activeDocument.file, activeDocument.handle);
    } else {
      await createDocument(
        officeFormatForRoute(requestedRouteFormat.value),
        requestedRouteFormat.value,
      );
    }
  }
  stopWindowFileHandoff = receiveWindowFileHandoff('office', (file, handle) => {
    void openFile(file, handle as RecentDocument['handle']);
  });
});

onBeforeRouteLeave(() => {
  if (hasUnsavedOfficeChanges() && !window.confirm('当前文档有未保存修改，确定离开 Office 吗？'))
    return false;
  disposeOfficeRuntime();
  return true;
});

onBeforeRouteUpdate(() => {
  if (hasUnsavedOfficeChanges() && !window.confirm('当前文档有未保存修改，确定切换页面吗？'))
    return false;
  return true;
});

onBeforeUnmount(() => {
  stopWindowFileHandoff();
  document.removeEventListener('fullscreenchange', syncFullscreenState);
  window.removeEventListener('resize', keepMenuInViewport);
  window.removeEventListener('mousemove', moveMenuWithMouse);
  window.removeEventListener('mouseup', endMenuMouseDrag);
  window.removeEventListener('pointermove', moveMenu);
  window.removeEventListener('pointerup', endMenuDrag);
  window.removeEventListener('pointercancel', endMenuDrag);
  workspaceActive.value = false;
  workspaceHeaderVisible.value = true;
  disposeOfficeRuntime();
});
</script>

<template>
  <section class="office-studio" :class="{ 'office-studio--workspace': isWorkspace }">
    <div
      v-show="!isWorkspace"
      class="office-landing"
      :class="{ 'office-landing--empty': !recentDocuments.length }"
    >
      <p v-if="error" class="office-error" role="alert">{{ error }}</p>

      <section class="office-format-section" aria-label="新建文档">
        <div class="office-new-layout">
          <div class="office-format-grid">
            <button
              v-for="card in formatCards"
              :key="card.format"
              class="office-format-card"
              :class="[
                `office-format-card--${card.tone}`,
                { 'is-requested': requestedFormat === card.format },
              ]"
              type="button"
              :disabled="busy"
              @click="openFormat(card.routeFormat)"
            >
              <span class="office-format-card__icon">
                <component :is="card.icon" :size="30" />
              </span>
              <span class="office-format-card__body">
                <small>{{ card.label }}</small>
                <strong>{{ card.title }}</strong>
                <span>{{ card.description }}</span>
              </span>
            </button>
          </div>
          <button
            class="office-open-file"
            :class="{ 'is-file-dragging': isFileDragging }"
            type="button"
            :disabled="busy"
            @click="chooseFile"
            @dragenter.prevent="handleFileDragEnter"
            @dragover.prevent
            @dragleave.prevent="handleFileDragLeave"
            @drop.prevent="handleFileDrop"
          >
            <IconFolderOpen :size="22" />
            <span>打开本地 Office 文档</span>
          </button>
        </div>
      </section>

      <section class="office-recent" aria-label="最近文档">
        <div class="office-section-heading">
          <div>
            <h2><IconHistory :size="20" /> 历史记录</h2>
          </div>
        </div>
        <div v-if="recentDocuments.length" class="office-recent-list">
          <article
            v-for="document in recentDocuments"
            :key="document.id"
            class="office-recent-item"
            :class="`office-recent-item--${document.extension.toLowerCase()}`"
          >
            <button
              class="office-recent-item__open"
              type="button"
              :disabled="busy"
              @click="openRecent(document)"
            >
              <span class="office-recent-item__icon">
                <component :is="recentIcon(document.extension)" :size="23" />
              </span>
              <span class="office-recent-item__body">
                <strong>{{ document.name }}</strong>
                <span
                  >{{ formatSize(document.size) }} · {{ formatDate(document.lastOpenedAt) }}</span
                >
              </span>
            </button>
            <button
              class="office-recent-item__delete"
              type="button"
              :disabled="busy"
              :aria-label="`从历史记录删除 ${document.name}`"
              title="从历史记录删除"
              @click="removeRecent(document.id)"
            >
              <IconTrash :size="18" />
            </button>
          </article>
        </div>
        <button v-else class="office-empty" type="button" @click="chooseFile">
          <IconFolderOpen :size="30" />
          <strong>还没有最近文档</strong>
          <span>打开或首次保存本地文件后，会显示在这里。</span>
        </button>
      </section>
    </div>

    <section
      v-show="isWorkspace"
      ref="workspaceElement"
      class="office-workspace"
      aria-label="Office 文档编辑器"
    >
      <div
        v-if="busy"
        class="office-runtime-loading"
        :class="`office-runtime-loading--${loadingFormat}`"
        role="status"
        aria-live="polite"
      >
        <span class="office-runtime-loading__spinner"></span>
        <strong>{{ stage }}</strong>
        <span>首次使用会加载同源字体与 x2t WASM，之后由 Studio 缓存。</span>
      </div>
      <div id="office-editor-host" class="office-editor-host"></div>
      <nav
        ref="workspaceMenuElement"
        class="office-workspace__menu"
        :class="{
          'is-dragging': isMenuDragging,
          'office-workspace__menu--header-visible': workspaceHeaderVisible,
        }"
        :style="menuPositionStyle"
        aria-label="编辑器菜单"
      >
        <span
          class="office-workspace__menu-handle"
          title="拖动菜单"
          @pointerdown="startMenuDrag"
          @mousedown.prevent="startMenuMouseDrag"
          @pointermove="moveMenu"
          @pointerup="endMenuDrag"
          @pointercancel="endMenuDrag"
        >
          <IconGripHorizontal :size="17" />
        </span>
        <button
          type="button"
          :aria-label="isFullscreen ? '退出全屏' : '全屏编辑'"
          :title="isFullscreen ? '退出全屏' : '全屏编辑'"
          @click="toggleFullscreen"
        >
          <IconArrowsMinimize v-if="isFullscreen" :size="19" />
          <IconArrowsMaximize v-else :size="19" />
        </button>
        <button type="button" aria-label="返回 Office 工作台" title="返回" @click="closeWorkspace">
          <IconArrowLeft :size="19" />
        </button>
      </nav>
      <studio-header-toggle :visible="workspaceHeaderVisible" @click="toggleWorkspaceHeader" />
    </section>

    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept=".docx,.xlsx,.pptx,.csv"
      @change="handleFileChange"
    />
  </section>
</template>
