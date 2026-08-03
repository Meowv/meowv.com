<script setup lang="ts">
import { PackageOpen, Scissors, Trash2 } from '@/features/pdf/icons';
import { splitPdf } from '@/features/pdf/core/split';
import { bundleGeneratedFiles } from '@/features/pdf/core/shared/download';
import {
  chunkPages,
  parsePageRanges,
  type PageRangeParseResult,
} from '@/features/pdf/core/shared/ranges';
import type { PdfOperationResult } from '@/features/pdf/core/types';

type SplitMode = 'segments' | 'every' | 'chunk' | 'groups';

const { files, loading, errors, addFiles, clearFiles } = usePdfFiles();
const operation = usePdfOperation();
const mode = ref<SplitMode>('segments');
const expression = ref('1-3,5');
const chunkSize = ref(5);
const prefix = ref('split');
const file = computed(() => files.value[0] ?? null);

const parsed = computed<PageRangeParseResult>(() => {
  if (!file.value) {
    return { valid: false, groups: [], error: '' };
  }
  if (mode.value === 'every') {
    return {
      valid: true,
      groups: chunkPages(file.value.pageCount, 1),
      error: '',
    };
  }
  if (mode.value === 'chunk') {
    const groups = chunkPages(file.value.pageCount, chunkSize.value);
    return {
      valid: groups.length > 0,
      groups,
      error: groups.length ? '' : '每组页数必须大于 0',
    };
  }
  return parsePageRanges(
    expression.value,
    file.value.pageCount,
    mode.value === 'groups' ? 'groups' : 'segments',
  );
});

watch(
  file,
  (value) => {
    if (value) {
      operation.setReady();
      expression.value = value.pageCount >= 5 ? '1-3,5' : `1-${value.pageCount}`;
      prefix.value = value.name.replace(/\.pdf$/i, '');
    } else {
      operation.reset();
    }
  },
  { immediate: true },
);

async function addSingle(selected: File[]): Promise<void> {
  clearFiles();
  await addFiles(selected.slice(0, 1));
}

async function runSplit(): Promise<void> {
  if (!file.value || !parsed.value.valid) {
    return;
  }

  await operation.run(async (signal) => {
    const result = await splitPdf(file.value!.bytes, parsed.value.groups, prefix.value, signal);
    if (result.files.length <= 1) {
      return result;
    }
    const zip = await bundleGeneratedFiles(result.files, `${prefix.value}-pages.zip`);
    const packaged: PdfOperationResult = {
      ...result,
      files: [zip],
    };
    return packaged;
  }, '正在拆分并生成文件');
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
  mode.value = 'segments';
  expression.value = '1-3,5';
  prefix.value = 'split';
}

function modeHelp(value: SplitMode): string {
  const messages: Record<SplitMode, string> = {
    segments: '每个逗号分隔的范围生成一个 PDF，例如 1-3,5,8-10。',
    every: '每一页生成一个单独的 PDF，结果将自动打包为 ZIP。',
    chunk: '按固定页数连续拆分，最后一组可少于设定页数。',
    groups: '使用分号分组，例如 1-3;4-8;9-12。',
  };
  return messages[value];
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
    title="拆分 PDF"
    description="按页码范围、固定页数或自定义分组拆分 PDF。"
    :ready="Boolean(file)"
    :upload-errors="errors"
    :operation-error="operation.error.value"
  >
    <FileDropzone title="将一个 PDF 拖到这里" @files="addSingle" />

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
      <PdfViewer v-if="file" :bytes="file.bytes" :label="`${file.name} 预览`" />
    </template>

    <template #settings>
      <div class="settings-heading">
        <Scissors :size="20" aria-hidden="true" />
        <div>
          <span class="eyebrow">拆分方式</span>
          <h2>设置页码</h2>
        </div>
      </div>

      <fieldset class="segmented-control">
        <legend class="sr-only">选择拆分方式</legend>
        <label
          v-for="option in [
            { value: 'segments', label: '自定义范围' },
            { value: 'every', label: '每页' },
            { value: 'chunk', label: '每 N 页' },
            { value: 'groups', label: '自定义分组' },
          ]"
          :key="option.value"
        >
          <input v-model="mode" type="radio" :value="option.value" />
          <span>{{ option.label }}</span>
        </label>
      </fieldset>

      <p class="field-help">{{ modeHelp(mode) }}</p>

      <label v-if="mode === 'segments' || mode === 'groups'" class="field">
        <span>页码表达式</span>
        <input
          v-model="expression"
          type="text"
          :placeholder="mode === 'groups' ? '1-3;4-8;9-12' : '1-3,5,8-10'"
          autocomplete="off"
        />
        <small v-if="parsed.error" class="field-error">{{ parsed.error }}</small>
      </label>

      <label v-if="mode === 'chunk'" class="field">
        <span>每个文件包含页数</span>
        <input v-model.number="chunkSize" type="number" min="1" :max="file?.pageCount" />
      </label>

      <label class="field">
        <span>文件名前缀</span>
        <input v-model="prefix" type="text" autocomplete="off" />
      </label>

      <div class="estimate-card">
        <PackageOpen :size="19" />
        <span>预计生成</span>
        <strong>{{ parsed.valid ? parsed.groups.length : 0 }} 个文件</strong>
      </div>
    </template>

    <template #actions>
      <span>生成多个结果时会自动打包 ZIP。</span>
      <button
        type="button"
        class="button button--primary button--large"
        :disabled="!parsed.valid || loading"
        @click="runSplit"
      >
        <Scissors :size="18" /> 拆分 PDF
      </button>
    </template>
  </WorkspaceFrame>
</template>
