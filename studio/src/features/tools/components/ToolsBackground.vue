<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useToolsBackground } from '@/features/tools/composables/useToolsBackground';
import {
  loadBackgroundVideoSource,
  type BackgroundVideoSource,
} from '@/features/tools/services/background-video-cache';

const { activeVideoUrl, pendingVideoUrl, opacity, blur, setLoading, commitVideo, rejectVideo } =
  useToolsBackground();

const videoElement = ref<HTMLVideoElement | null>(null);
const ready = ref(false);
let loadToken = 0;
let loadedSource: BackgroundVideoSource | null = null;

const requestedVideoUrl = computed(() => pendingVideoUrl.value ?? activeVideoUrl.value);
const backgroundStyle = computed<Record<string, string>>(() => ({
  '--tools-background-opacity': String(opacity.value),
  '--tools-background-blur': `${blur.value}px`,
}));

function resetVideo(): void {
  ready.value = false;
  const video = videoElement.value;
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  loadedSource?.release();
  loadedSource = null;
}

async function loadVideo(url: string | null): Promise<void> {
  const video = videoElement.value;
  if (!url || !video) return;

  const token = ++loadToken;
  ready.value = false;
  setLoading(true);
  video.pause();
  const source = await loadBackgroundVideoSource(url);
  if (token !== loadToken) {
    source.release();
    return;
  }

  loadedSource?.release();
  loadedSource = source;
  video.src = source.src;
  video.load();

  await nextTick();
  if (token !== loadToken) return;
}

async function handleCanPlay(): Promise<void> {
  const video = videoElement.value;
  const url = requestedVideoUrl.value;
  if (!video || !url) return;

  ready.value = true;
  setLoading(false);
  await video.play().catch(() => undefined);

  if (pendingVideoUrl.value === url) {
    commitVideo(url);
  }
}

function handleError(): void {
  ready.value = false;
  rejectVideo();
}

watch(
  requestedVideoUrl,
  (url) => {
    if (!url) {
      ++loadToken;
      resetVideo();
      setLoading(false);
      return;
    }
    void nextTick(() => loadVideo(url));
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  ++loadToken;
  resetVideo();
});
</script>

<template>
  <div
    v-if="requestedVideoUrl"
    class="tools-background"
    :class="{ 'tools-background--ready': ready }"
    :style="backgroundStyle"
    aria-hidden="true"
  >
    <video
      ref="videoElement"
      class="tools-background__video"
      preload="none"
      muted
      loop
      playsinline
      @canplay="handleCanPlay"
      @error="handleError"
    ></video>
    <div class="tools-background__scrim"></div>
  </div>
</template>
