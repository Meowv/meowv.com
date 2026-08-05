<script setup lang="ts">
import { Image, Stamp, Trash2, Type } from '@/features/pdf/icons';
import {
  addWatermark,
  type WatermarkLayer,
  type WatermarkPosition,
} from '@/features/pdf/core/watermark';
import { parsePageRanges } from '@/features/pdf/core/shared/ranges';
import PdfSelect from '@/features/pdf/components/common/PdfSelect.vue';

const { files, loading, errors, addFiles, clearFiles } = usePdfFiles();
const operation = usePdfOperation();
const file = computed(() => files.value[0] ?? null);
const type = ref<'text' | 'image'>('text');
const text = ref('仅供内部使用');
const watermarkImage = shallowRef<File | null>(null);
const watermarkImageUrl = ref('');
const fontSize = ref(36);
const color = ref('#c2413d');
const opacity = ref(0.28);
const rotation = ref(-30);
const tiled = ref(false);
const horizontalGap = ref(90);
const verticalGap = ref(80);
const position = ref<WatermarkPosition>('center');
const layer = ref<WatermarkLayer>('above');
const scale = ref(1);
const pageMode = ref<'all' | 'range'>('all');
const pageRange = ref('1');
const outputName = ref('watermarked.pdf');
const progress = ref(0);

const selectedPages = computed(() => {
  if (!file.value) {
    return { pages: [] as number[], error: '' };
  }
  if (pageMode.value === 'all') {
    return {
      pages: Array.from({ length: file.value.pageCount }, (_, index) => index + 1),
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

watch(
  file,
  (value) => {
    if (value) {
      operation.setReady();
      outputName.value = `${value.name.replace(/\.pdf$/i, '')}-watermarked.pdf`;
      pageRange.value = `1-${value.pageCount}`;
    } else {
      operation.reset();
    }
  },
  { immediate: true },
);

function clearWatermarkImage(): void {
  if (watermarkImageUrl.value) {
    URL.revokeObjectURL(watermarkImageUrl.value);
    watermarkImageUrl.value = '';
  }
  watermarkImage.value = null;
}

onBeforeUnmount(() => {
  clearWatermarkImage();
});

async function addSingle(selected: File[]): Promise<void> {
  clearFiles();
  await addFiles(selected.slice(0, 1));
}

function setWatermarkImage(selected: FileList | null): void {
  const next = selected?.[0];
  if (!next || !['image/png', 'image/jpeg', 'image/webp'].includes(next.type)) {
    return;
  }
  clearWatermarkImage();
  watermarkImage.value = next;
  watermarkImageUrl.value = URL.createObjectURL(next);
}

async function applyWatermark(): Promise<void> {
  if (
    !file.value ||
    !selectedPages.value.pages.length ||
    (type.value === 'image' && !watermarkImage.value)
  ) {
    return;
  }
  progress.value = 0;
  await operation.run(
    (signal) =>
      addWatermark(
        file.value!.bytes,
        {
          type: type.value,
          text: text.value,
          ...(watermarkImage.value ? { image: watermarkImage.value } : {}),
          fontSize: fontSize.value,
          color: color.value,
          opacity: opacity.value,
          rotation: rotation.value,
          tiled: tiled.value,
          horizontalGap: horizontalGap.value,
          verticalGap: verticalGap.value,
          position: position.value,
          layer: layer.value,
          scale: scale.value,
          pages: selectedPages.value.pages,
          outputName: outputName.value,
        },
        signal,
        (current, total) => {
          progress.value = current;
          operation.updateStage(`正在为第 ${current} / ${total} 页添加水印`);
        },
      ),
    '正在准备水印',
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
  clearWatermarkImage();
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
    title="PDF 添加水印"
    description="添加文字或图片水印，参数预览和最终导出都在浏览器内完成。"
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
        :overlay-text="type === 'text' ? text : ''"
        :overlay-image-url="type === 'image' ? watermarkImageUrl : ''"
        :overlay-opacity="opacity"
        :overlay-rotation="rotation"
        :overlay-position="position"
        :overlay-color="color"
        :overlay-font-size="fontSize"
        :overlay-scale="scale"
        :overlay-tiled="tiled"
        :overlay-horizontal-gap="horizontalGap"
        :overlay-vertical-gap="verticalGap"
      />
      <WorkspaceNotice type="info">
        这里使用低分辨率代表页预览；点击正式处理后才会写入完整 PDF。
      </WorkspaceNotice>
    </template>

    <template #settings>
      <div class="settings-heading">
        <Stamp :size="20" aria-hidden="true" />
        <div>
          <span class="eyebrow">水印内容</span>
          <h2>水印设置</h2>
        </div>
      </div>

      <fieldset class="segmented-control">
        <legend class="sr-only">水印类型</legend>
        <label
          ><input v-model="type" type="radio" value="text" /><span
            ><Type :size="15" />文字水印</span
          ></label
        >
        <label
          ><input v-model="type" type="radio" value="image" /><span
            ><Image :size="15" />图片水印</span
          ></label
        >
      </fieldset>

      <label v-if="type === 'text'" class="field">
        <span>水印内容</span>
        <input v-model="text" type="text" maxlength="80" autocomplete="off" />
      </label>
      <label v-else class="field">
        <span>水印图片</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          @change="setWatermarkImage(($event.target as HTMLInputElement).files)"
        />
        <small>支持 PNG、JPG 和 WebP，自动保持比例。</small>
      </label>

      <div v-if="type === 'text'" class="field-grid">
        <label class="field"
          ><span>字号</span><input v-model.number="fontSize" type="number" min="8" max="180"
        /></label>
        <label class="field field--color"
          ><span>颜色</span><input v-model="color" type="color"
        /></label>
      </div>
      <label v-else class="field">
        <span>图片大小 {{ Math.round(scale * 100) }}%</span>
        <input v-model.number="scale" type="range" min="0.2" max="2" step="0.1" />
      </label>

      <label class="field">
        <span>透明度 {{ Math.round(opacity * 100) }}%</span>
        <input v-model.number="opacity" type="range" min="0.05" max="1" step="0.05" />
      </label>
      <label class="field">
        <span>旋转角度</span>
        <input v-model.number="rotation" type="range" min="-180" max="180" step="5" />
        <small>{{ rotation }}°</small>
      </label>

      <label class="switch-row">
        <input v-model="tiled" type="checkbox" />
        <span>平铺水印</span>
      </label>
      <label class="field">
        <span>水印层级</span>
        <PdfSelect v-model="layer">
          <option value="above">页面内容上方</option>
          <option value="below">页面内容下方</option>
        </PdfSelect>
        <small v-if="layer === 'below'">背景水印可能被页面中的不透明内容遮挡。</small>
      </label>
      <div v-if="tiled" class="field-grid">
        <label class="field"
          ><span>横向间距</span
          ><input v-model.number="horizontalGap" type="number" min="10" max="300"
        /></label>
        <label class="field"
          ><span>纵向间距</span
          ><input v-model.number="verticalGap" type="number" min="10" max="300"
        /></label>
      </div>
      <label v-else class="field">
        <span>位置</span>
        <PdfSelect v-model="position">
          <option value="top-left">左上</option>
          <option value="top-center">顶部居中</option>
          <option value="top-right">右上</option>
          <option value="middle-left">左侧居中</option>
          <option value="center">页面居中</option>
          <option value="middle-right">右侧居中</option>
          <option value="bottom-left">左下</option>
          <option value="bottom-center">底部居中</option>
          <option value="bottom-right">右下</option>
        </PdfSelect>
      </label>

      <label class="field">
        <span>页面范围</span>
        <PdfSelect v-model="pageMode">
          <option value="all">全部页面</option>
          <option value="range">指定页面</option>
        </PdfSelect>
      </label>
      <label v-if="pageMode === 'range'" class="field">
        <span>页码</span><input v-model="pageRange" type="text" placeholder="1-3,5" />
        <small v-if="selectedPages.error" class="field-error">{{ selectedPages.error }}</small>
      </label>
      <label class="field">
        <span>输出文件名</span><input v-model="outputName" type="text" autocomplete="off" />
      </label>
    </template>

    <template #actions>
      <span>中文文字会先在本地画布中生成透明图像，避免乱码。</span>
      <button
        type="button"
        class="button button--primary button--large"
        :disabled="!selectedPages.pages.length || loading || (type === 'image' && !watermarkImage)"
        @click="applyWatermark"
      >
        <Stamp :size="18" /> 添加水印
      </button>
    </template>
  </WorkspaceFrame>
</template>
