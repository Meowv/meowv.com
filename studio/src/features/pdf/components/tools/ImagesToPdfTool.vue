<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  ImagePlus,
  Images,
  Plus,
  Trash2,
} from '@/features/pdf/icons';
import { VueDraggable } from 'vue-draggable-plus';
import {
  imagesToPdf,
  type ImageLayout,
  type ImagePageOrientation,
  type ImagePageSize,
} from '@/features/pdf/core/convert/images-to-pdf';
import { decodeImageFile } from '@/features/pdf/core/shared/canvas';
import PdfSelect from '@/features/pdf/components/common/PdfSelect.vue';

interface LocalImage {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
}

interface ImageUploadError {
  name: string;
  message: string;
}

const operation = usePdfOperation();
const images = shallowRef<LocalImage[]>([]);
const fileErrors = ref<ImageUploadError[]>([]);
const outputName = ref('images.pdf');
const pageSize = ref<ImagePageSize>('a4');
const orientation = ref<ImagePageOrientation>('auto');
const layout = ref<ImageLayout>('contain');
const marginPreset = ref<'none' | 'narrow' | 'standard' | 'custom'>('standard');
const customMargin = ref(36);
const background = ref('#ffffff');
const qualityPreset = ref<'high' | 'balanced' | 'small' | 'custom'>('balanced');
const customQuality = ref(0.82);
const customWidthMm = ref(210);
const customHeightMm = ref(297);
const progress = ref(0);

const margin = computed(() => {
  const values = { none: 0, narrow: 18, standard: 36, custom: customMargin.value };
  return values[marginPreset.value];
});
const quality = computed(() => {
  const values = { high: 0.95, balanced: 0.82, small: 0.65, custom: customQuality.value };
  return values[qualityPreset.value];
});

onMounted(() => {
  window.addEventListener('paste', onPaste);
});

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste);
  revokeAll();
});

function onPaste(event: ClipboardEvent): void {
  const pasted = Array.from(event.clipboardData?.files ?? []).filter((file) =>
    file.type.startsWith('image/'),
  );
  if (pasted.length) {
    void addImages(pasted);
  }
}

async function addImages(files: File[]): Promise<void> {
  fileErrors.value = [];
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

  for (const file of files) {
    if (!allowed.has(file.type)) {
      fileErrors.value.push({ name: file.name, message: '仅支持 JPG、PNG 和 WebP。' });
      continue;
    }
    try {
      const decoded = await decodeImageFile(file);
      try {
        images.value = [
          ...images.value,
          {
            id: crypto.randomUUID(),
            file,
            url: URL.createObjectURL(file),
            width: decoded.width,
            height: decoded.height,
          },
        ];
      } finally {
        decoded.close();
      }
    } catch {
      fileErrors.value.push({ name: file.name, message: '浏览器无法读取这张图片。' });
    }
  }

  if (images.value.length) {
    operation.setReady();
  }
}

function removeImage(id: string): void {
  const target = images.value.find((image) => image.id === id);
  if (target) {
    URL.revokeObjectURL(target.url);
  }
  images.value = images.value.filter((image) => image.id !== id);
  if (!images.value.length) {
    operation.reset();
  }
}

function move(index: number, offset: -1 | 1): void {
  const target = index + offset;
  if (target < 0 || target >= images.value.length) {
    return;
  }
  const next = [...images.value];
  const [item] = next.splice(index, 1);
  if (item) {
    next.splice(target, 0, item);
    images.value = next;
  }
}

function revokeAll(): void {
  images.value.forEach((image) => URL.revokeObjectURL(image.url));
  images.value = [];
}

async function convert(): Promise<void> {
  if (!images.value.length) {
    return;
  }
  progress.value = 0;
  await operation.run(
    (signal) =>
      imagesToPdf(
        images.value.map((image) => image.file),
        {
          outputName: outputName.value,
          pageSize: pageSize.value,
          orientation: orientation.value,
          layout: layout.value,
          margin: margin.value,
          background: background.value,
          quality: quality.value,
          customWidthMm: customWidthMm.value,
          customHeightMm: customHeightMm.value,
        },
        signal,
        (current) => {
          progress.value = current;
          operation.updateStage(`正在生成第 ${current} / ${images.value.length} 页`);
        },
      ),
    '正在读取图片',
  );
}

async function continueWithResult(): Promise<void> {
  resetAll();
}

function resetAll(): void {
  revokeAll();
  operation.reset();
  fileErrors.value = [];
  progress.value = 0;
  outputName.value = 'images.pdf';
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
    :total="images.length"
    @cancel="operation.cancel"
  />
  <WorkspaceFrame
    v-else
    title="图片转 PDF"
    description="一张图片生成一页 PDF，支持排序、方向、边距和质量设置。"
    :ready="images.length > 0"
    :upload-errors="fileErrors"
    :operation-error="operation.error.value"
  >
    <FileDropzone
      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
      title="将图片拖到这里"
      hint="支持 JPG、PNG 和 WebP；不会上传原图"
      multiple
      @files="addImages"
    />
    <template #main>
      <header class="workspace-panel__header">
        <div>
          <span class="eyebrow">图片顺序</span>
          <h2>{{ images.length }} 张图片，预计 {{ images.length }} 页</h2>
        </div>
        <label class="button button--secondary file-picker-button">
          <Plus :size="17" /> 继续添加
          <input
            class="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            @change="addImages(Array.from(($event.target as HTMLInputElement).files || []))"
          />
        </label>
      </header>

      <VueDraggable
        v-model="images"
        class="image-list"
        handle=".image-row__handle"
        :animation="180"
      >
        <article v-for="(image, index) in images" :key="image.id" class="image-row">
          <button type="button" class="icon-button image-row__handle" aria-label="拖动调整图片顺序">
            <GripVertical :size="18" />
          </button>
          <img :src="image.url" :alt="`${image.file.name} 预览`" />
          <div class="image-row__content">
            <strong>{{ image.file.name }}</strong>
            <span>{{ image.width }} × {{ image.height }} px</span>
          </div>
          <button
            type="button"
            class="icon-button"
            :disabled="index === 0"
            :aria-label="`上移 ${image.file.name}`"
            @click="move(index, -1)"
          >
            <ArrowUp :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            :disabled="index === images.length - 1"
            :aria-label="`下移 ${image.file.name}`"
            @click="move(index, 1)"
          >
            <ArrowDown :size="16" />
          </button>
          <button
            type="button"
            class="icon-button danger"
            :aria-label="`删除 ${image.file.name}`"
            @click="removeImage(image.id)"
          >
            <Trash2 :size="17" />
          </button>
        </article>
      </VueDraggable>
    </template>

    <template #settings>
      <div class="settings-heading">
        <Images :size="20" aria-hidden="true" />
        <div>
          <span class="eyebrow">页面布局</span>
          <h2>输出设置</h2>
        </div>
      </div>

      <label class="field">
        <span>页面尺寸</span>
        <PdfSelect v-model="pageSize">
          <option value="fit">适应图片</option>
          <option value="a4">A4</option>
          <option value="a3">A3</option>
          <option value="letter">Letter</option>
          <option value="custom">自定义尺寸</option>
        </PdfSelect>
      </label>
      <div v-if="pageSize === 'custom'" class="field-grid">
        <label class="field"
          ><span>宽度（mm）</span><input v-model.number="customWidthMm" type="number" min="20"
        /></label>
        <label class="field"
          ><span>高度（mm）</span><input v-model.number="customHeightMm" type="number" min="20"
        /></label>
      </div>

      <label class="field">
        <span>方向</span>
        <PdfSelect v-model="orientation">
          <option value="auto">自动</option>
          <option value="portrait">纵向</option>
          <option value="landscape">横向</option>
        </PdfSelect>
      </label>
      <label class="field">
        <span>图片布局</span>
        <PdfSelect v-model="layout">
          <option value="contain">完整适应</option>
          <option value="cover">填满页面</option>
          <option value="original">原始尺寸</option>
        </PdfSelect>
      </label>
      <label class="field">
        <span>边距</span>
        <PdfSelect v-model="marginPreset">
          <option value="none">无边距</option>
          <option value="narrow">窄</option>
          <option value="standard">标准</option>
          <option value="custom">自定义</option>
        </PdfSelect>
      </label>
      <label v-if="marginPreset === 'custom'" class="field">
        <span>边距（pt）</span>
        <input v-model.number="customMargin" type="number" min="0" max="180" />
      </label>
      <label class="field field--color">
        <span>页面背景</span>
        <input v-model="background" type="color" />
        <code>{{ background }}</code>
      </label>
      <label class="field">
        <span>图片质量</span>
        <PdfSelect v-model="qualityPreset">
          <option value="high">高质量</option>
          <option value="balanced">平衡</option>
          <option value="small">较小文件</option>
          <option value="custom">自定义</option>
        </PdfSelect>
      </label>
      <label v-if="qualityPreset === 'custom'" class="field">
        <span>质量 {{ Math.round(customQuality * 100) }}%</span>
        <input v-model.number="customQuality" type="range" min="0.4" max="1" step="0.05" />
      </label>
      <label class="field">
        <span>输出文件名</span>
        <input v-model="outputName" type="text" autocomplete="off" />
      </label>
    </template>

    <template #actions>
      <span>图片会按当前顺序逐页写入新 PDF。</span>
      <button
        type="button"
        class="button button--primary button--large"
        :disabled="images.length === 0"
        @click="convert"
      >
        <ImagePlus :size="18" /> 转换为 PDF
      </button>
    </template>
  </WorkspaceFrame>
</template>
