<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconDownload, IconEraser, IconSparkles } from '@tabler/icons-vue';
import FileUploader from '@/features/tools/components/FileUploader.vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { downloadBlob } from '@/features/image/utils/download';
import { formatBytes } from '@/features/image/utils/format';
import { createFaviconPackage, createIco } from './favicon';

const props = defineProps<{ mode: 'ico' | 'favicon' }>();

const source = ref<File | null>(null);
const previewUrl = ref('');
const result = ref<Blob | null>(null);
const size = ref(32);
const processing = ref(false);
const error = ref('');

const content = computed(() =>
  props.mode === 'ico'
    ? {
        title: 'PNG 转 ICO',
        description: '将图片等比缩放并封装为标准 ICO 文件。',
        filename: 'favicon.ico',
      }
    : {
        title: 'Favicon 生成器',
        description: '生成网站常用图标、ICO 与 Web App Manifest 压缩包。',
        filename: 'favicon-package.zip',
      },
);

function releasePreview(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

function select(files: File[]): void {
  const selected = files[0];
  if (!selected) return;
  releasePreview();
  source.value = selected;
  previewUrl.value = URL.createObjectURL(selected);
  result.value = null;
  error.value = '';
}

async function generate(): Promise<void> {
  if (!source.value) return;
  processing.value = true;
  result.value = null;
  error.value = '';
  try {
    result.value =
      props.mode === 'ico'
        ? await createIco(source.value, size.value)
        : await createFaviconPackage(source.value);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '图标生成失败。';
  } finally {
    processing.value = false;
  }
}

function clear(): void {
  releasePreview();
  source.value = null;
  result.value = null;
  error.value = '';
}

function download(): void {
  if (result.value) downloadBlob(result.value, content.value.filename);
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
        <div v-if="source" class="tool-file-summary">
          <img :src="previewUrl" :alt="source.name" />
          <div>
            <strong>{{ source.name }}</strong
            ><span>{{ formatBytes(source.size) }}</span>
          </div>
          <button type="button" class="tool-button tool-button--danger" @click="clear">移除</button>
        </div>
        <label v-if="mode === 'ico'" class="tool-field">
          <span>ICO 尺寸</span>
          <select v-model.number="size">
            <option v-for="option in [16, 32, 48, 64, 128, 256]" :key="option" :value="option">
              {{ option }} × {{ option }} px
            </option>
          </select>
        </label>
        <ToolActions>
          <button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="!source || processing"
            @click="generate"
          >
            <IconSparkles :size="16" aria-hidden="true" />
            {{ processing ? '生成中…' : '生成图标' }}
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>

    <ToolSection title="生成结果" description="文件仅在浏览器中生成。" tone="output">
      <div class="tool-stack">
        <div v-if="previewUrl" class="tool-image-preview tool-image-preview--checker">
          <img :src="previewUrl" alt="图标预览" />
        </div>
        <div v-else class="tool-image-preview tool-image-preview--empty">图标将在这里预览</div>
        <p v-if="result" class="tool-status" role="status">
          已生成 {{ content.filename }}，大小 {{ formatBytes(result.size) }}。
        </p>
        <button
          type="button"
          class="tool-button tool-button--primary"
          :disabled="!result"
          @click="download"
        >
          <IconDownload :size="16" aria-hidden="true" />下载 {{ content.filename }}
        </button>
      </div>
    </ToolSection>
  </div>
  <ToolHelp
    :steps="
      mode === 'ico'
        ? ['选择图片并设置输出尺寸。', '点击生成图标。', '下载 favicon.ico。']
        : ['选择清晰的方形图片。', '点击生成图标。', '下载并解压 Favicon 资源包。']
    "
    note="透明区域会保留；非方形图片会等比缩放并居中，不会拉伸。"
  />
</template>
