<script setup lang="ts">
import {
  CheckCheck,
  Copy,
  Download,
  FlipHorizontal2,
  Redo2,
  RotateCcw,
  RotateCw,
  Rows3,
  Trash2,
  Undo2,
} from '@/features/tools/tools/_shared/pdf/icons';
import { usePdfFiles } from '@/features/tools/tools/_shared/pdf/composables/usePdfFiles';
import { usePdfOperation } from '@/features/tools/tools/_shared/pdf/composables/usePdfOperation';
import {
  createPageStates,
  duplicatePageStates,
  exportPageStates,
  markPagesDeleted,
  rotatePageStates,
} from '@/features/tools/tools/_shared/pdf/core/organize';
import { splitPdf } from '@/features/tools/tools/_shared/pdf/core/split';
import { bundleGeneratedFiles } from '@/features/tools/tools/_shared/pdf/core/shared/download';
import {
  pagesByParity,
  parsePageRanges,
} from '@/features/tools/tools/_shared/pdf/core/shared/ranges';
import type { PageState } from '@/features/tools/tools/_shared/pdf/core/types';
import PdfThumbnailGrid from '../pdf/PdfThumbnailGrid.vue';
import FileDropzone from '../upload/FileDropzone.vue';
import OperationResult from '../workspace/OperationResult.vue';
import ProcessingState from '../workspace/ProcessingState.vue';
import WorkspaceFrame from '../workspace/WorkspaceFrame.vue';
import WorkspaceNotice from '../workspace/WorkspaceNotice.vue';

type PageToolMode = 'organize' | 'delete' | 'extract' | 'rotate';

const props = defineProps<{
  mode: PageToolMode;
}>();

const { files, loading, errors, addFiles, clearFiles } = usePdfFiles();
const operation = usePdfOperation();
const pages = ref<PageState[]>([]);
const selectedIds = ref(new Set<string>());
const past = ref<PageState[][]>([]);
const future = ref<PageState[][]>([]);
const thumbnailWidth = ref(150);
const rangeInput = ref('');
const extractMode = ref<'merged' | 'separate'>('merged');
const outputName = ref('');
const lastSelectedIndex = ref<number | null>(null);
const file = computed(() => files.value[0] ?? null);

const config = computed(() => {
  const values: Record<
    PageToolMode,
    { title: string; description: string; action: string; defaultName: string }
  > = {
    organize: {
      title: '整理 PDF 页面',
      description: '重新排序、复制、旋转或删除页面，再导出一个新 PDF。',
      action: '导出整理后的 PDF',
      defaultName: 'organized.pdf',
    },
    delete: {
      title: '删除 PDF 页面',
      description: '选择页面并应用删除标记，可撤销或恢复，确认后导出新文件。',
      action: '导出删除后的 PDF',
      defaultName: 'pages-removed.pdf',
    },
    extract: {
      title: '提取 PDF 页面',
      description: '选择需要的页面，合并导出或逐页打包下载。',
      action: '提取选中页面',
      defaultName: 'extracted.pdf',
    },
    rotate: {
      title: '旋转 PDF',
      description: '旋转全部或指定页面，导出时会真正写入页面旋转属性。',
      action: '导出旋转后的 PDF',
      defaultName: 'rotated.pdf',
    },
  };
  return values[props.mode];
});

const activePageCount = computed(() => pages.value.filter((page) => !page.deleted).length);
const selectedCount = computed(() => selectedIds.value.size);
const deletedCount = computed(() => pages.value.length - activePageCount.value);
const selectedActiveCount = computed(
  () => pages.value.filter((page) => selectedIds.value.has(page.id) && !page.deleted).length,
);
const selectedDeletedCount = computed(
  () => pages.value.filter((page) => selectedIds.value.has(page.id) && page.deleted).length,
);
const retainedCount = computed(() => activePageCount.value);
const canApplyDelete = computed(
  () => selectedActiveCount.value > 0 && activePageCount.value - selectedActiveCount.value > 0,
);
const canProcess = computed(() => {
  if (!file.value || loading.value) {
    return false;
  }
  if (props.mode === 'delete') {
    return deletedCount.value > 0 && retainedCount.value > 0;
  }
  if (props.mode === 'extract') {
    return selectedCount.value > 0;
  }
  return retainedCount.value > 0;
});

const pagesModel = computed({
  get: () => pages.value,
  set: (value: PageState[]) => commit(value),
});

watch(
  file,
  (value) => {
    if (!value) {
      pages.value = [];
      operation.reset();
      return;
    }
    pages.value = createPageStates(value.pageCount);
    selectedIds.value = new Set();
    past.value = [];
    future.value = [];
    outputName.value = config.value.defaultName;
    operation.setReady();
  },
  { immediate: true },
);

watch(
  () => props.mode,
  () => {
    outputName.value = config.value.defaultName;
    selectedIds.value = new Set();
  },
);

async function addSingle(selected: File[]): Promise<void> {
  clearFiles();
  await addFiles(selected.slice(0, 1));
}

function snapshot(value: PageState[]): PageState[] {
  return value.map((page) => ({ ...page }));
}

function commit(next: PageState[]): void {
  past.value = [...past.value.slice(-49), snapshot(pages.value)];
  pages.value = snapshot(next);
  future.value = [];
}

function undo(): void {
  const previous = past.value.at(-1);
  if (!previous) {
    return;
  }
  future.value = [snapshot(pages.value), ...future.value].slice(0, 50);
  pages.value = snapshot(previous);
  past.value = past.value.slice(0, -1);
}

function redo(): void {
  const next = future.value[0];
  if (!next) {
    return;
  }
  past.value = [...past.value.slice(-49), snapshot(pages.value)];
  pages.value = snapshot(next);
  future.value = future.value.slice(1);
}

function onSelect(id: string, event: MouseEvent): void {
  const index = pages.value.findIndex((page) => page.id === id);
  const next = new Set(selectedIds.value);

  if (event.shiftKey && lastSelectedIndex.value !== null) {
    const start = Math.min(lastSelectedIndex.value, index);
    const end = Math.max(lastSelectedIndex.value, index);
    for (let position = start; position <= end; position += 1) {
      const page = pages.value[position];
      if (page) {
        next.add(page.id);
      }
    }
  } else if (event.metaKey || event.ctrlKey) {
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
  } else if (next.size === 1 && next.has(id)) {
    next.clear();
  } else {
    next.clear();
    next.add(id);
  }

  selectedIds.value = next;
  lastSelectedIndex.value = index;
}

function selectAll(): void {
  selectedIds.value = new Set(pages.value.map((page) => page.id));
}

function clearSelection(): void {
  selectedIds.value = new Set();
  lastSelectedIndex.value = null;
}

function invertSelection(): void {
  selectedIds.value = new Set(
    pages.value.filter((page) => !selectedIds.value.has(page.id)).map((page) => page.id),
  );
}

function selectParity(parity: 'odd' | 'even'): void {
  const pageNumbers = new Set(pagesByParity(pages.value.length, parity));
  selectedIds.value = new Set(
    pages.value.filter((_, index) => pageNumbers.has(index + 1)).map((page) => page.id),
  );
}

function applyRange(): void {
  if (!file.value) {
    return;
  }
  const parsed = parsePageRanges(rangeInput.value, pages.value.length);
  if (!parsed.valid) {
    return;
  }
  const pageNumbers = new Set(parsed.groups.flatMap((group) => group.pages));
  selectedIds.value = new Set(
    pages.value.filter((_, index) => pageNumbers.has(index + 1)).map((page) => page.id),
  );
}

function rotateSelected(rotation: number): void {
  const targets =
    selectedIds.value.size > 0 ? selectedIds.value : new Set(pages.value.map((page) => page.id));
  commit(rotatePageStates(pages.value, targets, rotation));
}

function markDeleted(): void {
  if (selectedIds.value.size === 0) {
    return;
  }
  const next = markPagesDeleted(pages.value, selectedIds.value);
  if (next.filter((page) => !page.deleted).length === 0) {
    return;
  }
  commit(next);
  clearSelection();
}

function restoreDeleted(): void {
  commit(pages.value.map((page) => ({ ...page, deleted: false })));
  clearSelection();
}

function restoreSelectedDeleted(): void {
  if (selectedDeletedCount.value === 0) {
    return;
  }
  commit(
    pages.value.map((page) =>
      selectedIds.value.has(page.id) && page.deleted ? { ...page, deleted: false } : { ...page },
    ),
  );
  clearSelection();
}

function duplicateSelected(): void {
  if (selectedIds.value.size === 0) {
    return;
  }
  commit(duplicatePageStates(pages.value, selectedIds.value));
  clearSelection();
}

async function processPages(): Promise<void> {
  if (!file.value || !canProcess.value) {
    return;
  }

  await operation.run(
    async (signal) => {
      if (props.mode === 'extract' && extractMode.value === 'separate') {
        const groups = pages.value
          .map((page, index) => ({ page, index }))
          .filter(({ page }) => selectedIds.value.has(page.id))
          .map(({ index }) => ({
            label: `page-${index + 1}`,
            pages: [index + 1],
          }));
        const result = await splitPdf(file.value!.bytes, groups, 'extracted', signal);
        if (result.files.length <= 1) {
          return result;
        }
        const zip = await bundleGeneratedFiles(result.files, 'extracted-pages.zip');
        return { ...result, files: [zip] };
      }

      let exportStates = pages.value;
      if (props.mode === 'extract') {
        exportStates = pages.value.map((page) => ({
          ...page,
          deleted: !selectedIds.value.has(page.id),
        }));
      }

      return exportPageStates(file.value!.bytes, exportStates, outputName.value, signal);
    },
    props.mode === 'extract' ? '正在提取选中页面' : '正在生成新的 PDF',
  );
}

async function continueWithResult(): Promise<void> {
  const generated = operation.result.value?.files[0];
  if (!generated || generated.mimeType !== 'application/pdf') {
    resetAll();
    return;
  }
  const next = new File([generated.blob], generated.name, { type: generated.mimeType });
  clearFiles();
  operation.reset();
  await addFiles([next]);
}

function resetAll(): void {
  clearFiles();
  operation.reset();
  pages.value = [];
  selectedIds.value = new Set();
  past.value = [];
  future.value = [];
}
</script>

<template>
  <OperationResult
    v-if="operation.result.value"
    :result="operation.result.value"
    @continue="continueWithResult"
    @reset="resetAll"
  />
  <ProcessingState
    v-else-if="operation.status.value === 'processing'"
    :stage="operation.stage.value"
    @cancel="operation.cancel"
  />
  <WorkspaceFrame
    v-else
    :title="config.title"
    :description="config.description"
    :ready="Boolean(file)"
    :upload-errors="errors"
    :operation-error="operation.error.value"
  >
    <FileDropzone @files="addSingle" />

    <template #main>
      <header class="workspace-panel__header page-toolbar">
        <div>
          <span class="eyebrow">页面预览</span>
          <h2>{{ file?.name }}</h2>
          <small>{{ pages.length }} 页 · 已选择 {{ selectedCount }} 页</small>
        </div>
        <div class="inline-actions">
          <button
            type="button"
            class="icon-button"
            :disabled="past.length === 0"
            aria-label="撤销"
            @click="undo"
          >
            <Undo2 :size="17" />
          </button>
          <button
            type="button"
            class="icon-button"
            :disabled="future.length === 0"
            aria-label="重做"
            @click="redo"
          >
            <Redo2 :size="17" />
          </button>
          <button type="button" class="text-button danger" @click="resetAll">
            <Trash2 :size="16" /> 更换文件
          </button>
        </div>
      </header>

      <div class="bulk-toolbar" aria-label="页面批量操作">
        <button type="button" class="text-button" @click="selectAll">
          <CheckCheck :size="16" /> 全选
        </button>
        <button type="button" class="text-button" @click="clearSelection">取消选择</button>
        <button type="button" class="text-button" @click="invertSelection">
          <FlipHorizontal2 :size="16" /> 反选
        </button>
        <button
          v-if="mode === 'delete' || mode === 'extract'"
          type="button"
          class="text-button"
          @click="selectParity('odd')"
        >
          奇数页
        </button>
        <button
          v-if="mode === 'delete' || mode === 'extract'"
          type="button"
          class="text-button"
          @click="selectParity('even')"
        >
          偶数页
        </button>
        <button
          v-if="mode === 'organize' || mode === 'rotate'"
          type="button"
          class="text-button"
          @click="rotateSelected(-90)"
        >
          <RotateCcw :size="16" /> 左转
        </button>
        <button
          v-if="mode === 'organize' || mode === 'rotate'"
          type="button"
          class="text-button"
          @click="rotateSelected(90)"
        >
          <RotateCw :size="16" /> 右转
        </button>
        <button
          v-if="mode === 'organize' || mode === 'rotate'"
          type="button"
          class="text-button"
          @click="rotateSelected(180)"
        >
          旋转 180°
        </button>
        <button
          v-if="mode === 'organize'"
          type="button"
          class="text-button"
          :disabled="selectedCount === 0"
          @click="duplicateSelected"
        >
          <Copy :size="16" /> 复制
        </button>
        <button
          v-if="mode === 'organize'"
          type="button"
          class="text-button danger"
          :disabled="selectedCount === 0"
          @click="markDeleted"
        >
          <Trash2 :size="16" /> 标记删除
        </button>
        <button
          v-if="mode === 'organize' && activePageCount < pages.length"
          type="button"
          class="text-button"
          @click="restoreDeleted"
        >
          恢复全部
        </button>
        <button
          v-if="mode === 'delete'"
          type="button"
          class="text-button danger"
          :disabled="!canApplyDelete"
          @click="markDeleted"
        >
          <Trash2 :size="16" /> 应用删除
        </button>
        <button
          v-if="mode === 'delete'"
          type="button"
          class="text-button"
          :disabled="selectedDeletedCount === 0"
          @click="restoreSelectedDeleted"
        >
          <RotateCcw :size="16" /> 恢复选中
        </button>
        <button
          v-if="mode === 'delete' && deletedCount > 0"
          type="button"
          class="text-button"
          @click="restoreDeleted"
        >
          恢复全部
        </button>
      </div>

      <PdfThumbnailGrid
        v-if="file"
        v-model="pagesModel"
        :bytes="file.bytes"
        :selected-ids="selectedIds"
        :thumbnail-width="thumbnailWidth"
        :sortable="mode === 'organize'"
        @select="onSelect"
      />
    </template>

    <template #settings>
      <div class="settings-heading">
        <Rows3 :size="20" aria-hidden="true" />
        <div>
          <span class="eyebrow">页面操作</span>
          <h2>处理设置</h2>
        </div>
      </div>

      <label class="field">
        <span>按页码选择</span>
        <div class="field-inline">
          <input v-model="rangeInput" type="text" placeholder="1-3,5,8-10" />
          <button type="button" class="button button--secondary" @click="applyRange">应用</button>
        </div>
      </label>

      <label class="field">
        <span>缩略图大小</span>
        <input v-model.number="thumbnailWidth" type="range" min="110" max="220" step="10" />
      </label>

      <fieldset v-if="mode === 'extract'" class="field">
        <legend>输出方式</legend>
        <label class="radio-row">
          <input v-model="extractMode" type="radio" value="merged" />
          合并选中页面为一个 PDF
        </label>
        <label class="radio-row">
          <input v-model="extractMode" type="radio" value="separate" />
          每页单独导出并打包 ZIP
        </label>
      </fieldset>

      <label v-if="mode !== 'extract' || extractMode === 'merged'" class="field">
        <span>输出文件名</span>
        <input v-model="outputName" type="text" autocomplete="off" />
      </label>

      <dl class="summary-list">
        <div>
          <dt>已选择</dt>
          <dd>{{ selectedCount }} 页</dd>
        </div>
        <div v-if="mode === 'delete'">
          <dt>已标记删除</dt>
          <dd>{{ deletedCount }} 页</dd>
        </div>
        <div v-if="mode === 'delete'">
          <dt>将保留</dt>
          <dd>{{ retainedCount }} 页</dd>
        </div>
        <div v-else>
          <dt>有效页面</dt>
          <dd>{{ activePageCount }} 页</dd>
        </div>
      </dl>

      <WorkspaceNotice
        v-if="mode === 'delete' && selectedActiveCount > 0 && !canApplyDelete"
        type="warning"
      >
        当前选择会删除全部剩余页面，请取消选择至少一页。
      </WorkspaceNotice>
      <WorkspaceNotice v-else-if="mode === 'delete' && deletedCount === 0" type="info">
        选择页面后点击“应用删除”，该操作会写入撤销记录。
      </WorkspaceNotice>
      <WorkspaceNotice v-if="mode === 'rotate' && selectedCount === 0" type="info">
        未选择页面时，旋转按钮会作用于全部页面。
      </WorkspaceNotice>
    </template>

    <template #actions>
      <span>支持拖拽与键盘按钮调整顺序，最多保留 50 步撤销记录。</span>
      <button
        type="button"
        class="button button--primary button--large"
        :disabled="!canProcess"
        @click="processPages"
      >
        <Download :size="18" /> {{ config.action }}
      </button>
    </template>
  </WorkspaceFrame>
</template>
