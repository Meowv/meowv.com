<script setup lang="ts">
import { CheckCircle2, Download, Files, RotateCcw } from '@/features/tools/tools/_shared/pdf/icons';
import type { PdfOperationResult } from '@/features/tools/tools/_shared/pdf/core/types';
import { downloadGeneratedFile } from '@/features/tools/tools/_shared/pdf/core/shared/download';
import {
  formatDuration,
  formatFileSize,
} from '@/features/tools/tools/_shared/pdf/core/shared/format';

type OperationResultView = Omit<PdfOperationResult, 'files' | 'warnings'> & {
  readonly files: ReadonlyArray<PdfOperationResult['files'][number]>;
  readonly warnings: ReadonlyArray<PdfOperationResult['warnings'][number]>;
};

defineProps<{
  result: OperationResultView;
}>();

const emit = defineEmits<{
  reset: [];
  continue: [];
}>();
</script>

<template>
  <section class="result-card" aria-live="polite">
    <CheckCircle2 class="result-card__icon" :size="34" aria-hidden="true" />
    <div class="result-card__heading">
      <h2>处理完成</h2>
      <p>共生成 {{ result.files.length }} 个文件，用时 {{ formatDuration(result.duration) }}</p>
    </div>

    <ul class="result-files">
      <li v-for="file in result.files" :key="file.name">
        <span><Files :size="18" /> {{ file.name }}</span>
        <small>{{ formatFileSize(file.size) }}</small>
        <button type="button" class="button button--primary" @click="downloadGeneratedFile(file)">
          <Download :size="17" /> 下载
        </button>
      </li>
    </ul>

    <div v-if="result.warnings.length" class="notice notice--warning">
      <strong>处理提示</strong>
      <ul>
        <li v-for="warning in result.warnings" :key="`${warning.code}-${warning.pageNumber}`">
          {{ warning.message }}
        </li>
      </ul>
    </div>

    <div class="result-card__actions">
      <button type="button" class="button button--secondary" @click="emit('continue')">
        <RotateCcw :size="17" /> 继续处理当前结果
      </button>
      <button type="button" class="text-button" @click="emit('reset')">处理其他文件</button>
    </div>
  </section>
</template>
