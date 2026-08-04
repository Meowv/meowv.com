<script setup lang="ts">
import { Hash, ListOrdered, Trash2 } from '@/features/pdf/icons';
import {
  addPageNumbers,
  calculatePageNumberSequenceEnd,
  formatPageNumber,
  type PageNumberFormat,
} from '@/features/pdf/core/page-number';
import { parsePageRanges } from '@/features/pdf/core/shared/ranges';
import type { WatermarkPosition } from '@/features/pdf/core/watermark';
import PdfSelect from '@/features/pdf/components/common/PdfSelect.vue';

const { files, loading, errors, addFiles, clearFiles } = usePdfFiles();
const operation = usePdfOperation();
const file = computed(() => files.value[0] ?? null);
const format = ref<PageNumberFormat>('ratio');
const startNumber = ref(1);
const startPdfPage = ref(1);
const skipCover = ref(false);
const pageMode = ref<'from' | 'range'>('from');
const pageRange = ref('1');
const fontSize = ref(11);
const color = ref('#202124');
const opacity = ref(0.9);
const horizontalMargin = ref(36);
const verticalMargin = ref(28);
const position = ref<WatermarkPosition>('bottom-center');
const outputName = ref('numbered.pdf');
const progress = ref(0);

const selectedPages = computed(() => {
  if (!file.value) {
    return { pages: [] as number[], error: '' };
  }
  if (pageMode.value === 'from') {
    const start = skipCover.value ? Math.max(2, startPdfPage.value) : startPdfPage.value;
    if (start < 1 || start > file.value.pageCount) {
      return { pages: [], error: `起始页必须在 1 到 ${file.value.pageCount} 之间` };
    }
    return {
      pages: Array.from({ length: file.value.pageCount - start + 1 }, (_, index) => start + index),
      error: '',
    };
  }
  const parsed = parsePageRanges(pageRange.value, file.value.pageCount);
  return {
    pages: parsed.valid
      ? [...new Set(parsed.groups.flatMap((group) => group.pages))].sort((a, b) => a - b)
      : [],
    error: parsed.error,
  };
});

const previewText = computed(() => {
  const sequenceEnd = calculatePageNumberSequenceEnd(
    startNumber.value,
    selectedPages.value.pages.length,
  );
  return formatPageNumber(startNumber.value, sequenceEnd, format.value);
});

watch(
  file,
  (value) => {
    if (value) {
      operation.setReady();
      outputName.value = `${value.name.replace(/\.pdf$/i, '')}-numbered.pdf`;
      pageRange.value = `1-${value.pageCount}`;
    } else {
      operation.reset();
    }
  },
  { immediate: true },
);

watch(skipCover, (enabled) => {
  if (enabled) {
    startPdfPage.value = Math.max(2, startPdfPage.value);
  }
});

async function addSingle(selected: File[]): Promise<void> {
  clearFiles();
  await addFiles(selected.slice(0, 1));
}

async function applyPageNumbers(): Promise<void> {
  if (!file.value || !selectedPages.value.pages.length) {
    return;
  }
  progress.value = 0;
  await operation.run(
    (signal) =>
      addPageNumbers(
        file.value!.bytes,
        {
          format: format.value,
          startNumber: startNumber.value,
          pages: selectedPages.value.pages,
          fontSize: fontSize.value,
          color: color.value,
          opacity: opacity.value,
          horizontalMargin: horizontalMargin.value,
          verticalMargin: verticalMargin.value,
          position: position.value,
          outputName: outputName.value,
        },
        signal,
        (current, total) => {
          progress.value = current;
          operation.updateStage(`正在为第 ${current} / ${total} 页添加页码`);
        },
      ),
    '正在准备页码',
  );
}

async function continueWithResult(): Promise<void> {
  const generated = operation.result.value?.files[0];
  if (!generated) {
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
  progress.value = 0;
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
    :progress="progress"
    :total="selectedPages.pages.length"
    @cancel="operation.cancel"
  />
  <WorkspaceFrame
    v-else
    title="PDF 添加页码"
    description="选择页码格式、起始位置和页面范围，实时预览后导出。"
    :ready="Boolean(file)"
    :upload-errors="errors"
    :operation-error="operation.error.value"
  >
    <FileDropzone @files="addSingle" />

    <template #main>
      <header class="workspace-panel__header">
        <div>
          <span class="eyebrow">代表页预览</span>
          <h2>{{ file?.name }}</h2>
        </div>
        <button type="button" class="text-button danger" @click="resetAll">
          <Trash2 :size="16" /> 更换文件
        </button>
      </header>
      <PdfViewer
        v-if="file"
        :bytes="file.bytes"
        :overlay-text="previewText"
        :overlay-opacity="opacity"
        :overlay-rotation="0"
        :overlay-position="position"
        :overlay-color="color"
        :overlay-font-size="fontSize"
        :overlay-horizontal-margin="horizontalMargin"
        :overlay-vertical-margin="verticalMargin"
      />
      <WorkspaceNotice type="info">
        数字和中文页码都在本地画布中生成，避免中文字体缺失。
      </WorkspaceNotice>
    </template>

    <template #settings>
      <div class="settings-heading">
        <ListOrdered :size="20" aria-hidden="true" />
        <div>
          <span class="eyebrow">页码样式</span>
          <h2>页码设置</h2>
        </div>
      </div>

      <label class="field">
        <span>页码格式</span>
        <PdfSelect v-model="format">
          <option value="plain">1</option>
          <option value="two">01</option>
          <option value="three">001</option>
          <option value="chinese">第 1 页</option>
          <option value="ratio">1 / 10</option>
          <option value="chinese-ratio">第 1 页，共 10 页</option>
        </PdfSelect>
      </label>
      <div class="field-grid">
        <label class="field"
          ><span>起始数字</span><input v-model.number="startNumber" type="number" min="0"
        /></label>
        <label v-if="pageMode === 'from'" class="field"
          ><span>从 PDF 第几页</span
          ><input v-model.number="startPdfPage" type="number" min="1" :max="file?.pageCount"
        /></label>
      </div>
      <label class="switch-row"
        ><input v-model="skipCover" type="checkbox" /><span>跳过封面</span></label
      >
      <label class="field">
        <span>应用范围</span>
        <PdfSelect v-model="pageMode">
          <option value="from">从起始页到末页</option>
          <option value="range">指定范围</option>
        </PdfSelect>
      </label>
      <label v-if="pageMode === 'range'" class="field">
        <span>页码范围</span><input v-model="pageRange" type="text" placeholder="2-8,10" />
        <small v-if="selectedPages.error" class="field-error">{{ selectedPages.error }}</small>
      </label>

      <div class="field-grid">
        <label class="field"
          ><span>字号</span><input v-model.number="fontSize" type="number" min="6" max="72"
        /></label>
        <label class="field field--color"
          ><span>颜色</span><input v-model="color" type="color"
        /></label>
      </div>
      <label class="field">
        <span>透明度 {{ Math.round(opacity * 100) }}%</span>
        <input v-model.number="opacity" type="range" min="0.1" max="1" step="0.05" />
      </label>
      <label class="field">
        <span>位置</span>
        <PdfSelect v-model="position">
          <option value="top-left">左上</option>
          <option value="top-center">顶部居中</option>
          <option value="top-right">右上</option>
          <option value="bottom-left">左下</option>
          <option value="bottom-center">底部居中</option>
          <option value="bottom-right">右下</option>
        </PdfSelect>
      </label>
      <div class="field-grid">
        <label class="field"
          ><span>左右边距</span
          ><input v-model.number="horizontalMargin" type="number" min="0" max="180"
        /></label>
        <label class="field"
          ><span>上下边距</span
          ><input v-model.number="verticalMargin" type="number" min="0" max="180"
        /></label>
      </div>
      <label class="field"
        ><span>输出文件名</span><input v-model="outputName" type="text" autocomplete="off"
      /></label>
      <div class="estimate-card">
        <Hash :size="18" /><span>将添加</span
        ><strong>{{ selectedPages.pages.length }} 个页码</strong>
      </div>
    </template>

    <template #actions>
      <span>页码会写入新文件，原 PDF 保持不变。</span>
      <button
        type="button"
        class="button button--primary button--large"
        :disabled="!selectedPages.pages.length || loading"
        @click="applyPageNumbers"
      >
        <Hash :size="18" /> 添加页码
      </button>
    </template>
  </WorkspaceFrame>
</template>
