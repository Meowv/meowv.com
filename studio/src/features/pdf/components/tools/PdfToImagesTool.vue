<script setup lang="ts">
import { Download, FileImage, Gauge, Trash2 } from '@/features/pdf/icons';
import { pdfToImages } from '@/features/pdf/core/convert/pdf-to-images';
import { bundleGeneratedFiles } from '@/features/pdf/core/shared/download';
import { formatFileSize } from '@/features/pdf/core/shared/format';
import { pagesByParity, parsePageRanges } from '@/features/pdf/core/shared/ranges';
import PdfSelect from '@/features/pdf/components/common/PdfSelect.vue';

type PageSelectionMode = 'all' | 'range' | 'odd' | 'even';

const { files, loading, errors, addFiles, clearFiles } = usePdfFiles();
const operation = usePdfOperation();
const selectionMode = ref<PageSelectionMode>('all');
const rangeInput = ref('1-3');
const format = ref<'png' | 'jpeg' | 'webp'>('png');
const scale = ref(1.5);
const quality = ref(0.88);
const progress = ref(0);
const webpSupported = ref(true);
const file = computed(() => files.value[0] ?? null);

const pageSelection = computed(() => {
  if (!file.value) {
    return { pages: [] as number[], error: '' };
  }
  if (selectionMode.value === 'all') {
    return {
      pages: Array.from({ length: file.value.pageCount }, (_, index) => index + 1),
      error: '',
    };
  }
  if (selectionMode.value === 'odd' || selectionMode.value === 'even') {
    return {
      pages: pagesByParity(file.value.pageCount, selectionMode.value),
      error: '',
    };
  }
  const parsed = parsePageRanges(rangeInput.value, file.value.pageCount);
  return {
    pages: parsed.valid
      ? [...new Set(parsed.groups.flatMap((group) => group.pages))].sort((a, b) => a - b)
      : [],
    error: parsed.error,
  };
});

const estimatedSize = computed(() => {
  const averagePageBytes = format.value === 'png' ? 1_300_000 : 650_000 * quality.value;
  return pageSelection.value.pages.length * averagePageBytes * scale.value ** 2;
});

watch(
  file,
  (value) => {
    if (value) {
      operation.setReady();
      rangeInput.value = value.pageCount >= 3 ? '1-3' : `1-${value.pageCount}`;
    } else {
      operation.reset();
    }
  },
  { immediate: true },
);

onMounted(() => {
  const canvas = document.createElement('canvas');
  webpSupported.value = canvas.toDataURL('image/webp').startsWith('data:image/webp');
});

async function addSingle(selected: File[]): Promise<void> {
  clearFiles();
  await addFiles(selected.slice(0, 1));
}

async function convert(): Promise<void> {
  if (!file.value || !pageSelection.value.pages.length) {
    return;
  }
  progress.value = 0;
  await operation.run(async (signal) => {
    const result = await pdfToImages({
      bytes: file.value!.bytes,
      pages: pageSelection.value.pages,
      format: format.value,
      scale: scale.value,
      quality: quality.value,
      signal,
      onProgress: (current, total) => {
        progress.value = current;
        operation.updateStage(`正在转换第 ${current} / ${total} 页`);
      },
    });
    if (result.files.length <= 1) {
      return result;
    }
    const archive = await bundleGeneratedFiles(result.files, 'pdf-images.zip');
    return { ...result, files: [archive] };
  }, '正在解析 PDF 页面');
}

function resetAll(): void {
  clearFiles();
  operation.reset();
  progress.value = 0;
  selectionMode.value = 'all';
}
</script>

<template>
  <OperationResult
    v-if="operation.result.value"
    :result="operation.result.value"
    @continue="resetAll"
    @reset="resetAll"
  />
  <ProcessingState
    v-else-if="operation.status.value === 'processing'"
    :stage="operation.stage.value"
    :progress="progress"
    :total="pageSelection.pages.length"
    @cancel="operation.cancel"
  />
  <WorkspaceFrame
    v-else
    title="PDF 转图片"
    description="将全部或指定 PDF 页面导出为 PNG、JPG 或 WebP。"
    :ready="Boolean(file)"
    :upload-errors="errors"
    :operation-error="operation.error.value"
  >
    <FileDropzone @files="addSingle" />

    <template #main>
      <header class="workspace-panel__header">
        <div>
          <span class="eyebrow">文件预览</span>
          <h2>{{ file?.name }}</h2>
        </div>
        <button type="button" class="text-button danger" @click="resetAll">
          <Trash2 :size="16" /> 更换文件
        </button>
      </header>
      <PdfViewer v-if="file" :bytes="file.bytes" />
    </template>

    <template #settings>
      <div class="settings-heading">
        <FileImage :size="20" aria-hidden="true" />
        <div>
          <span class="eyebrow">图片导出</span>
          <h2>输出设置</h2>
        </div>
      </div>

      <label class="field">
        <span>导出页面</span>
        <PdfSelect v-model="selectionMode">
          <option value="all">全部页面</option>
          <option value="range">指定页码</option>
          <option value="odd">奇数页</option>
          <option value="even">偶数页</option>
        </PdfSelect>
      </label>
      <label v-if="selectionMode === 'range'" class="field">
        <span>页码范围</span>
        <input v-model="rangeInput" type="text" placeholder="1-3,5,8-10" />
        <small v-if="pageSelection.error" class="field-error">{{ pageSelection.error }}</small>
      </label>

      <label class="field">
        <span>图片格式</span>
        <PdfSelect v-model="format">
          <option value="png">PNG</option>
          <option value="jpeg">JPEG / JPG</option>
          <option v-if="webpSupported" value="webp">WebP</option>
        </PdfSelect>
      </label>

      <label class="field">
        <span>输出比例</span>
        <PdfSelect v-model.number="scale">
          <option :value="1">1×</option>
          <option :value="1.5">1.5×</option>
          <option :value="2">2×</option>
          <option :value="3">3×</option>
        </PdfSelect>
      </label>
      <label v-if="format !== 'png'" class="field">
        <span>图片质量 {{ Math.round(quality * 100) }}%</span>
        <input v-model.number="quality" type="range" min="0.45" max="1" step="0.05" />
      </label>

      <div class="estimate-card">
        <Gauge :size="19" />
        <span>粗略估计</span>
        <strong>{{ formatFileSize(estimatedSize) }}</strong>
      </div>
      <WorkspaceNotice v-if="scale >= 2" type="warning">
        较高的输出分辨率会占用更多内存，并增加处理时间。
      </WorkspaceNotice>
      <WorkspaceNotice type="info">
        实际文件大小取决于页面内容，这里的估计仅用于判断量级。
      </WorkspaceNotice>
    </template>

    <template #actions>
      <span>单页直接下载，多页会自动打包为 ZIP。</span>
      <button
        type="button"
        class="button button--primary button--large"
        :disabled="!pageSelection.pages.length || loading"
        @click="convert"
      >
        <Download :size="18" /> 转换为图片
      </button>
    </template>
  </WorkspaceFrame>
</template>
