<script setup lang="ts">
import { Files, Plus, Trash2 } from '@/features/tools/tools/_shared/pdf/icons';
import { usePdfFiles } from '@/features/tools/tools/_shared/pdf/composables/usePdfFiles';
import { usePdfOperation } from '@/features/tools/tools/_shared/pdf/composables/usePdfOperation';
import { mergePdfFiles } from '@/features/tools/tools/_shared/pdf/core/merge';
import { formatFileSize } from '@/features/tools/tools/_shared/pdf/core/shared/format';
import { warnForLargePdf } from '@/features/tools/tools/_shared/pdf/core/shared/file';
import FileDropzone from '../upload/FileDropzone.vue';
import PdfFileList from '../upload/PdfFileList.vue';
import OperationResult from '../workspace/OperationResult.vue';
import ProcessingState from '../workspace/ProcessingState.vue';
import WorkspaceFrame from '../workspace/WorkspaceFrame.vue';
import WorkspaceNotice from '../workspace/WorkspaceNotice.vue';

const { files, loading, errors, addFiles, removeFile, clearFiles, replaceFiles } = usePdfFiles();
const operation = usePdfOperation();
const outputName = ref('merged.pdf');

const totalPages = computed(() => files.value.reduce((total, file) => total + file.pageCount, 0));
const totalSize = computed(() => files.value.reduce((total, file) => total + file.size, 0));
const warnings = computed(() => files.value.flatMap(warnForLargePdf));
const canMerge = computed(() => files.value.length >= 2 && !loading.value);

watch(
  () => files.value.length,
  (count) => {
    if (count > 0) {
      operation.setReady();
    } else {
      operation.reset();
    }
  },
);

async function merge(): Promise<void> {
  if (!canMerge.value) {
    return;
  }
  await operation.run(
    (signal) => mergePdfFiles(files.value, outputName.value, signal),
    '正在按当前顺序合并 PDF',
  );
}

async function continueWithResult(): Promise<void> {
  const generated = operation.result.value?.files[0];
  if (!generated) {
    return;
  }
  const file = new File([generated.blob], generated.name, { type: generated.mimeType });
  clearFiles();
  operation.reset();
  await addFiles([file]);
}

function resetAll(): void {
  clearFiles();
  operation.reset();
  outputName.value = 'merged.pdf';
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
    title="合并 PDF"
    description="按列表顺序把多个 PDF 合并成一个新文件。"
    :ready="files.length > 0"
    :upload-errors="errors"
    :operation-error="operation.error.value"
  >
    <FileDropzone hint="至少添加两个 PDF，文件只在浏览器本地读取" multiple @files="addFiles" />

    <template #main>
      <header class="workspace-panel__header">
        <div>
          <span class="eyebrow">文件顺序</span>
          <h2>拖动调整合并顺序</h2>
        </div>
        <div class="inline-actions">
          <label class="button button--secondary file-picker-button">
            <Plus :size="17" />
            继续添加
            <input
              class="sr-only"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              @change="addFiles(($event.target as HTMLInputElement).files || [])"
            />
          </label>
          <button type="button" class="text-button danger" @click="clearFiles">
            <Trash2 :size="16" /> 清空
          </button>
        </div>
      </header>

      <PdfFileList
        :model-value="files"
        sortable
        @update:model-value="replaceFiles"
        @remove="removeFile"
      />

      <div v-if="warnings.length" class="notice notice--warning">
        <ul>
          <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
        </ul>
      </div>
    </template>

    <template #settings>
      <div class="settings-heading">
        <Files :size="20" aria-hidden="true" />
        <div>
          <span class="eyebrow">合并摘要</span>
          <h2>输出设置</h2>
        </div>
      </div>
      <dl class="summary-list">
        <div>
          <dt>文件</dt>
          <dd>{{ files.length }} 个</dd>
        </div>
        <div>
          <dt>总页数</dt>
          <dd>{{ totalPages }} 页</dd>
        </div>
        <div>
          <dt>总大小</dt>
          <dd>{{ formatFileSize(totalSize) }}</dd>
        </div>
      </dl>
      <label class="field">
        <span>输出文件名</span>
        <input v-model="outputName" type="text" autocomplete="off" />
      </label>
      <WorkspaceNotice v-if="files.length < 2" type="info">
        再添加 {{ 2 - files.length }} 个 PDF 后即可开始合并。
      </WorkspaceNotice>
    </template>

    <template #actions>
      <span>将按从上到下的顺序生成新文件，原文件不会改变。</span>
      <button
        type="button"
        class="button button--primary button--large"
        :disabled="!canMerge"
        @click="merge"
      >
        <Files :size="18" /> 合并 PDF
      </button>
    </template>
  </WorkspaceFrame>
</template>
