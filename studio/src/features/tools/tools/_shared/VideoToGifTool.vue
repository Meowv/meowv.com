<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconDownload, IconEraser, IconMovie } from '@tabler/icons-vue';
import FileUploader from '@/features/tools/components/FileUploader.vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { encodeGifAnimation, MAX_GIF_FRAMES, type GifFrame } from '@/features/image/core/image/gif';
import { downloadBlob } from '@/features/image/utils/download';
import { formatBytes } from '@/features/image/utils/format';

const video = ref<HTMLVideoElement | null>(null);
const file = ref<File | null>(null);
const sourceUrl = ref('');
const resultUrl = ref('');
const result = ref<Blob | null>(null);
const start = ref(0);
const duration = ref(3);
const fps = ref(8);
const width = ref(360);
const progress = ref(0);
const processing = ref(false);
const error = ref('');
const metadata = ref({ duration: 0, width: 0, height: 0 });
const frameCount = computed(() =>
  Math.min(MAX_GIF_FRAMES, Math.max(1, Math.ceil(duration.value * fps.value))),
);

function releaseUrls(): void {
  if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value);
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
  sourceUrl.value = '';
  resultUrl.value = '';
}

function select(files: File[]): void {
  const selected = files[0];
  if (!selected) return;
  releaseUrls();
  file.value = selected;
  sourceUrl.value = URL.createObjectURL(selected);
  result.value = null;
  progress.value = 0;
  error.value = '';
}

function readMetadata(): void {
  if (!video.value) return;
  metadata.value = {
    duration: video.value.duration,
    width: video.value.videoWidth,
    height: video.value.videoHeight,
  };
  duration.value = Math.min(3, Math.max(0.1, video.value.duration));
}

function seek(target: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const element = video.value;
    if (!element) {
      reject(new Error('视频预览尚未就绪。'));
      return;
    }
    const cleanup = () => {
      element.removeEventListener('seeked', done);
      element.removeEventListener('error', failed);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error('无法读取指定视频帧。'));
    };
    element.addEventListener('seeked', done, { once: true });
    element.addEventListener('error', failed, { once: true });
    element.currentTime = Math.min(Math.max(0, target), Math.max(0, element.duration - 0.001));
  });
}

async function generate(): Promise<void> {
  const element = video.value;
  if (!element || !file.value || !metadata.value.width) return;
  processing.value = true;
  error.value = '';
  result.value = null;
  progress.value = 0;
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
  resultUrl.value = '';
  try {
    const safeStart = Math.max(0, Math.min(start.value, metadata.value.duration));
    const safeDuration = Math.max(
      0.1,
      Math.min(duration.value, metadata.value.duration - safeStart),
    );
    const count = Math.min(
      MAX_GIF_FRAMES,
      Math.max(1, Math.ceil(safeDuration * Math.max(1, fps.value))),
    );
    const outputWidth = Math.max(64, Math.min(640, Math.trunc(width.value)));
    const outputHeight = Math.max(
      1,
      Math.round((outputWidth * metadata.value.height) / metadata.value.width),
    );
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('当前浏览器无法读取视频帧。');
    const frames: GifFrame[] = [];
    for (let index = 0; index < count; index += 1) {
      await seek(safeStart + (safeDuration * index) / count);
      context.drawImage(element, 0, 0, outputWidth, outputHeight);
      frames.push({
        width: outputWidth,
        height: outputHeight,
        data: context.getImageData(0, 0, outputWidth, outputHeight).data,
      });
      progress.value = Math.round(((index + 1) / count) * 90);
    }
    result.value = encodeGifAnimation(frames, {
      width: outputWidth,
      height: outputHeight,
      delayMs: 1000 / Math.max(1, fps.value),
      loop: 0,
    });
    resultUrl.value = URL.createObjectURL(result.value);
    progress.value = 100;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '视频转 GIF 失败。';
  } finally {
    processing.value = false;
  }
}

function clear(): void {
  releaseUrls();
  file.value = null;
  result.value = null;
  error.value = '';
  progress.value = 0;
  metadata.value = { duration: 0, width: 0, height: 0 };
}

onBeforeUnmount(releaseUrls);
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="本地视频" description="选择视频并设置需要截取的时间段。">
      <div class="tool-stack">
        <FileUploader
          accept="video/*,.mp4,.webm,.mov,.m4v"
          :max-size="500 * 1024 * 1024"
          @files="select"
        />
        <video
          v-if="sourceUrl"
          ref="video"
          class="tool-video-preview"
          :src="sourceUrl"
          controls
          preload="metadata"
          @loadedmetadata="readMetadata"
        ></video>
        <p v-if="file" class="tool-status">
          {{ file.name }} · {{ formatBytes(file.size) }} · {{ metadata.width }}×{{
            metadata.height
          }}
          · {{ metadata.duration.toFixed(2) }} 秒
        </p>
        <div class="tool-inline-fields">
          <label class="tool-field"
            ><span>开始时间（秒）</span
            ><input v-model.number="start" type="number" min="0" step="0.1"
          /></label>
          <label class="tool-field"
            ><span>截取时长（秒）</span
            ><input v-model.number="duration" type="number" min="0.1" max="10" step="0.1"
          /></label>
          <label class="tool-field"
            ><span>帧率</span><input v-model.number="fps" type="number" min="1" max="12"
          /></label>
          <label class="tool-field"
            ><span>输出宽度</span><input v-model.number="width" type="number" min="64" max="640"
          /></label>
        </div>
        <p class="tool-status">预计 {{ frameCount }} 帧，最多处理 {{ MAX_GIF_FRAMES }} 帧。</p>
        <ToolActions>
          <button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="!metadata.width || processing"
            @click="generate"
          >
            <IconMovie :size="16" aria-hidden="true" />{{
              processing ? `处理中 ${progress}%` : '生成 GIF'
            }}
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolSection title="GIF 结果" tone="output">
      <div class="tool-stack">
        <div class="tool-image-preview tool-image-preview--checker">
          <img v-if="resultUrl" :src="resultUrl" alt="GIF 结果" />
          <span v-else>生成结果将在这里显示</span>
        </div>
        <p v-if="result" class="tool-status">已生成 {{ formatBytes(result.size) }}。</p>
        <button
          type="button"
          class="tool-button tool-button--primary"
          :disabled="!result"
          @click="result && downloadBlob(result, 'video-clip.gif')"
        >
          <IconDownload :size="16" aria-hidden="true" />下载 GIF
        </button>
      </div>
    </ToolSection>
  </div>
  <ToolHelp
    :steps="['选择本地视频。', '设置开始时间、时长、帧率与宽度。', '生成并下载 GIF。']"
    note="为控制浏览器内存，单次最多 10 秒、50 帧、640px 宽；音频不会写入 GIF。"
  />
</template>
