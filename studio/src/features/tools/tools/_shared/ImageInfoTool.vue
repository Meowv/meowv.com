<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import FileUploader from '@/features/tools/components/FileUploader.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { detectImageMime, readImageDimensions } from '@/features/image/core/image';
import { formatBytes } from '@/features/image/utils/format';
import { readExif } from './image-inspector';

type ImageInfoMode = 'dimensions' | 'metadata' | 'exif';

const props = defineProps<{
  mode: ImageInfoMode;
}>();

const file = ref<File | null>(null);
const previewUrl = ref('');
const output = ref('');
const error = ref('');
const processing = ref(false);

const content = computed(() => {
  if (props.mode === 'dimensions') {
    return {
      title: '图片尺寸',
      description: '读取像素尺寸、宽高比与总像素。',
      filename: 'image-dimensions.json',
    };
  }
  if (props.mode === 'metadata') {
    return {
      title: '图片 Metadata',
      description: '查看文件、格式、尺寸与浏览器可读信息。',
      filename: 'image-metadata.json',
    };
  }
  return {
    title: 'EXIF 信息',
    description: '读取 JPEG 中常见的相机和拍摄参数。',
    filename: 'image-exif.json',
  };
});

function releasePreview(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

async function inspect(files: File[]): Promise<void> {
  const selected = files[0];
  if (!selected) return;
  releasePreview();
  file.value = selected;
  previewUrl.value = URL.createObjectURL(selected);
  output.value = '';
  error.value = '';
  processing.value = true;
  try {
    const dimensions = await readImageDimensions(selected);
    const mime = await detectImageMime(selected);
    if (props.mode === 'dimensions') {
      output.value = JSON.stringify(
        {
          width: dimensions.width,
          height: dimensions.height,
          aspectRatio: Number((dimensions.width / dimensions.height).toFixed(4)),
          megapixels: Number(((dimensions.width * dimensions.height) / 1_000_000).toFixed(3)),
        },
        null,
        2,
      );
    } else if (props.mode === 'metadata') {
      output.value = JSON.stringify(
        {
          name: selected.name,
          size: selected.size,
          formattedSize: formatBytes(selected.size),
          declaredType: selected.type || 'unknown',
          detectedType: mime || 'unknown',
          width: dimensions.width,
          height: dimensions.height,
          lastModified: new Date(selected.lastModified).toISOString(),
        },
        null,
        2,
      );
    } else {
      const exif = await readExif(selected);
      output.value = JSON.stringify(exif, null, 2);
      if (!Object.keys(exif).length)
        error.value = '没有读取到常见 EXIF 字段；PNG、WebP 或已清理的 JPEG 通常不包含 EXIF。';
    }
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '无法读取图片信息。';
  } finally {
    processing.value = false;
  }
}

function clear(): void {
  releasePreview();
  file.value = null;
  output.value = '';
  error.value = '';
}

onBeforeUnmount(releasePreview);
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="content.title" :description="content.description">
      <div class="tool-stack">
        <FileUploader accept="image/*,.svg" :max-size="100 * 1024 * 1024" @files="inspect" />
        <div v-if="file" class="tool-file-summary">
          <img :src="previewUrl" :alt="file.name" />
          <div>
            <strong>{{ file.name }}</strong>
            <span>{{ formatBytes(file.size) }}</span>
          </div>
          <button type="button" class="tool-button tool-button--danger" @click="clear">移除</button>
        </div>
        <p v-if="processing" class="tool-status" role="status">正在读取图片信息…</p>
        <p
          v-if="error"
          class="tool-status"
          :class="{ 'tool-status--error': !output }"
          role="status"
        >
          {{ error }}
        </p>
      </div>
    </ToolSection>
    <ToolOutput
      :title="`${content.title}结果`"
      :value="output"
      :filename="content.filename"
      mime-type="application/json;charset=utf-8"
    />
  </div>
  <ToolHelp
    :steps="['选择本地图片。', '等待浏览器读取图片信息。', '复制或下载 JSON 结果。']"
    note="不会上传图片；EXIF 仅解析 JPEG 中常见且未被清理的字段。"
  />
</template>
