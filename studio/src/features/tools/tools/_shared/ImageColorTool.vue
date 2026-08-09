<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { IconEraser } from '@tabler/icons-vue';
import CopyButton from '@/features/tools/components/CopyButton.vue';
import FileUploader from '@/features/tools/components/FileUploader.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { detectImageMime } from '@/features/image/core/image';
import { formatBytes } from '@/features/image/utils/format';
import { colorDetails, dominantColors, type ImageColor } from './image-colors';

const props = defineProps<{ mode: 'picker' | 'dominant' }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const file = ref<File | null>(null);
const previewUrl = ref('');
const picked = ref<ImageColor | null>(null);
const palette = ref<ImageColor[]>([]);
const error = ref('');
const processing = ref(false);

const content = computed(() =>
  props.mode === 'picker'
    ? { title: '图片取色器', description: '点击图片中的任意位置读取颜色。' }
    : { title: '主色提取', description: '分析图片并提取出现频率最高的颜色。' },
);

function releasePreview(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

async function select(files: File[]): Promise<void> {
  const selected = files[0];
  if (!selected) return;
  error.value = '';
  processing.value = true;
  picked.value = null;
  palette.value = [];
  try {
    const mime = await detectImageMime(selected);
    if (
      !mime ||
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(mime)
    ) {
      throw new Error('请选择 PNG、JPEG、WebP、GIF 或 BMP 图片。');
    }
    const bitmap = await createImageBitmap(selected);
    await nextTick();
    const target = canvas.value;
    if (!target) throw new Error('图片画布初始化失败。');
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    target.width = Math.max(1, Math.round(bitmap.width * scale));
    target.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = target.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('当前浏览器无法读取图片颜色。');
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    bitmap.close();
    releasePreview();
    file.value = selected;
    previewUrl.value = URL.createObjectURL(selected);
    if (props.mode === 'dominant') {
      const sample = document.createElement('canvas');
      const sampleScale = Math.min(1, 128 / Math.max(target.width, target.height));
      sample.width = Math.max(1, Math.round(target.width * sampleScale));
      sample.height = Math.max(1, Math.round(target.height * sampleScale));
      const sampleContext = sample.getContext('2d', { willReadFrequently: true });
      if (!sampleContext) throw new Error('当前浏览器无法分析图片颜色。');
      sampleContext.drawImage(target, 0, 0, sample.width, sample.height);
      palette.value = dominantColors(sampleContext.getImageData(0, 0, sample.width, sample.height));
    }
  } catch (cause) {
    file.value = null;
    error.value = cause instanceof Error ? cause.message : '图片颜色读取失败。';
  } finally {
    processing.value = false;
  }
}

function pick(event: MouseEvent): void {
  if (props.mode !== 'picker' || !canvas.value || !file.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const x = Math.min(
    canvas.value.width - 1,
    Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * canvas.value.width)),
  );
  const y = Math.min(
    canvas.value.height - 1,
    Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * canvas.value.height)),
  );
  const context = canvas.value.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const [red, green, blue] = context.getImageData(x, y, 1, 1).data;
  picked.value = colorDetails(red, green, blue);
}

function clear(): void {
  releasePreview();
  file.value = null;
  picked.value = null;
  palette.value = [];
  error.value = '';
  if (canvas.value) {
    canvas.value.width = 1;
    canvas.value.height = 1;
  }
}

onBeforeUnmount(releasePreview);
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="content.title" :description="content.description">
      <div class="tool-stack">
        <FileUploader
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          @files="select"
        />
        <div v-if="file" class="tool-file-summary">
          <img :src="previewUrl" :alt="file.name" />
          <div>
            <strong>{{ file.name }}</strong
            ><span>{{ formatBytes(file.size) }}</span>
          </div>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />移除
          </button>
        </div>
        <p v-if="processing" class="tool-status" role="status">正在本地分析颜色…</p>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>

    <ToolSection
      :title="mode === 'picker' ? '取色画布' : '颜色分析结果'"
      :description="mode === 'picker' ? '上传后直接点击图片取色。' : '点击颜色值即可复制。'"
      tone="output"
    >
      <div class="tool-stack">
        <div
          class="tool-color-canvas"
          :class="{ 'tool-color-canvas--picker': mode === 'picker' && file }"
        >
          <canvas ref="canvas" :class="{ 'is-empty': !file }" @click="pick" />
          <span v-if="!file">图片将在这里显示</span>
        </div>
        <div v-if="picked" class="tool-picked-color">
          <span :style="{ backgroundColor: picked.hex }" aria-hidden="true" />
          <div>
            <strong>{{ picked.hex }}</strong
            ><small>{{ picked.rgb }} · {{ picked.hsl }}</small>
          </div>
          <CopyButton :text="picked.hex" label="复制 HEX" />
        </div>
        <div v-if="palette.length" class="tool-color-palette">
          <article v-for="color in palette" :key="color.hex">
            <span :style="{ backgroundColor: color.hex }" aria-hidden="true" />
            <div>
              <strong>{{ color.hex }}</strong
              ><small>{{ color.percentage }}% · {{ color.rgb }}</small>
            </div>
            <CopyButton :text="color.hex" label="复制" />
          </article>
        </div>
      </div>
    </ToolSection>
  </div>
  <ToolHelp
    :steps="
      mode === 'picker'
        ? ['选择本地图片。', '点击图片中的目标位置。', '复制 HEX、RGB 或 HSL 颜色值。']
        : ['选择本地图片。', '等待浏览器提取主色。', '复制需要的调色板颜色。']
    "
    note="动态 GIF 仅分析第一帧；透明度低于 50% 的像素不计入主色。"
  />
</template>
