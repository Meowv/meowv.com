<script setup lang="ts">
import { Eraser, Save, Tags, Trash2 } from '@/features/pdf/icons';
import {
  clearEditableMetadata,
  readPdfMetadata,
  updatePdfMetadata,
} from '@/features/pdf/core/metadata';
import { formatFileSize } from '@/features/pdf/core/shared/format';
import type { PdfMetadata } from '@/features/pdf/core/types';

const { files, loading, errors, addFiles, clearFiles } = usePdfFiles();
const operation = usePdfOperation();
const file = computed(() => files.value[0] ?? null);
const metadata = ref<PdfMetadata | null>(null);
const metadataLoading = ref(false);
const metadataError = ref('');
const outputName = ref('metadata-updated.pdf');

function dateForInput(value: string): string {
  return value ? value.slice(0, 16) : '';
}

watch(
  file,
  async (value) => {
    if (!value) {
      metadata.value = null;
      operation.reset();
      return;
    }
    metadataLoading.value = true;
    metadataError.value = '';
    try {
      metadata.value = await readPdfMetadata(value.bytes);
      metadata.value.creationDate = dateForInput(metadata.value.creationDate);
      metadata.value.modificationDate = dateForInput(metadata.value.modificationDate);
      outputName.value = `${value.name.replace(/\.pdf$/i, '')}-metadata.pdf`;
      operation.setReady();
    } catch (error) {
      metadataError.value = error instanceof Error ? error.message : '无法读取 PDF 元数据';
    } finally {
      metadataLoading.value = false;
    }
  },
  { immediate: true },
);

async function addSingle(selected: File[]): Promise<void> {
  clearFiles();
  await addFiles(selected.slice(0, 1));
}

function clearMetadata(): void {
  if (metadata.value) {
    metadata.value = clearEditableMetadata(metadata.value);
  }
}

async function saveMetadata(): Promise<void> {
  if (!file.value || !metadata.value) {
    return;
  }
  await operation.run(
    () =>
      updatePdfMetadata(
        file.value!.bytes,
        {
          title: metadata.value!.title,
          author: metadata.value!.author,
          subject: metadata.value!.subject,
          keywords: metadata.value!.keywords,
          creationDate: metadata.value!.creationDate,
          modificationDate: metadata.value!.modificationDate,
        },
        outputName.value,
      ),
    '正在写入基础元数据',
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
  metadata.value = null;
  metadataError.value = '';
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
    title="PDF 元数据"
    description="查看和修改常见文档信息，始终导出一个新 PDF。"
    :ready="Boolean(file)"
    :upload-errors="errors"
    :operation-error="operation.error.value"
    :additional-errors="metadataError ? [metadataError] : []"
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

      <dl v-if="metadata" class="metadata-facts">
        <div>
          <dt>文件名</dt>
          <dd>{{ file?.name }}</dd>
        </div>
        <div>
          <dt>文件大小</dt>
          <dd>{{ formatFileSize(file?.size || 0) }}</dd>
        </div>
        <div>
          <dt>页数</dt>
          <dd>{{ metadata.pageCount }} 页</dd>
        </div>
        <div>
          <dt>PDF 版本</dt>
          <dd>{{ metadata.pdfVersion }}</dd>
        </div>
        <div>
          <dt>页面尺寸</dt>
          <dd>{{ metadata.pageSizes || '未读取' }}</dd>
        </div>
        <div>
          <dt>创建程序</dt>
          <dd>{{ metadata.creator || '未设置' }}</dd>
        </div>
        <div>
          <dt>PDF 生成程序</dt>
          <dd>{{ metadata.producer || '未设置' }}</dd>
        </div>
      </dl>
    </template>

    <template #settings>
      <div class="settings-heading">
        <Tags :size="20" aria-hidden="true" />
        <div>
          <span class="eyebrow">文档属性</span>
          <h2>编辑元数据</h2>
        </div>
      </div>

      <template v-if="metadata">
        <label class="field"
          ><span>标题</span><input v-model="metadata.title" type="text" autocomplete="off"
        /></label>
        <label class="field"
          ><span>作者</span><input v-model="metadata.author" type="text" autocomplete="off"
        /></label>
        <label class="field"
          ><span>主题</span><input v-model="metadata.subject" type="text" autocomplete="off"
        /></label>
        <label class="field">
          <span>关键词</span>
          <input
            v-model="metadata.keywords"
            type="text"
            placeholder="使用逗号分隔"
            autocomplete="off"
          />
        </label>
        <label class="field"
          ><span>创建时间</span><input v-model="metadata.creationDate" type="datetime-local"
        /></label>
        <label class="field"
          ><span>修改时间</span><input v-model="metadata.modificationDate" type="datetime-local"
        /></label>
        <label class="field"
          ><span>输出文件名</span><input v-model="outputName" type="text" autocomplete="off"
        /></label>

        <button type="button" class="button button--secondary button--full" @click="clearMetadata">
          <Eraser :size="17" /> 清除可编辑元数据
        </button>
      </template>
      <div v-else-if="metadataLoading" class="viewer-placeholder">正在读取元数据…</div>

      <WorkspaceNotice type="warning">
        当前仅处理 Info 字典中的基础元数据，不读取或清理
        XMP；附件、页面内容及其他位置仍可能包含隐私信息。
      </WorkspaceNotice>
    </template>

    <template #actions>
      <span>保存只会生成新文件，不会修改原 PDF。</span>
      <button
        type="button"
        class="button button--primary button--large"
        :disabled="!metadata || loading || metadataLoading"
        @click="saveMetadata"
      >
        <Save :size="18" /> 保存修改
      </button>
    </template>
  </WorkspaceFrame>
</template>
