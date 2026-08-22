<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useToolsBackground } from '@/features/tools/composables/useToolsBackground';
import {
  loadBackgroundVideoSource,
  type BackgroundVideoSource,
} from '@/features/tools/services/background-video-cache';

const { activeVideoUrl, pendingVideoUrl, opacity, blur, setLoading, commitVideo, rejectVideo } =
  useToolsBackground();

type VideoSlot = 0 | 1;

const firstVideoElement = ref<HTMLVideoElement | null>(null);
const secondVideoElement = ref<HTMLVideoElement | null>(null);
const visibleSlot = ref<VideoSlot | null>(null);
const visibleVideoUrl = ref<string | null>(null);
let loadToken = 0;
let pendingSlot: VideoSlot | null = null;
let pendingUrl: string | null = null;
const loadedSources: [BackgroundVideoSource | null, BackgroundVideoSource | null] = [null, null];
const cleanupTimers: [
  ReturnType<typeof setTimeout> | undefined,
  ReturnType<typeof setTimeout> | undefined,
] = [undefined, undefined];
const VIDEO_CROSSFADE_MS = 280;

const requestedVideoUrl = computed(() => pendingVideoUrl.value ?? activeVideoUrl.value);
const ready = computed(() => visibleSlot.value !== null);
const backgroundStyle = computed<Record<string, string>>(() => ({
  '--tools-background-opacity': String(opacity.value),
  '--tools-background-blur': `${blur.value}px`,
}));

function getVideoElement(slot: VideoSlot): HTMLVideoElement | null {
  return slot === 0 ? firstVideoElement.value : secondVideoElement.value;
}

function cleanupSlot(slot: VideoSlot): void {
  clearTimeout(cleanupTimers[slot]);
  cleanupTimers[slot] = undefined;

  const video = getVideoElement(slot);
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  loadedSources[slot]?.release();
  loadedSources[slot] = null;
}

function resetVideos(): void {
  visibleSlot.value = null;
  visibleVideoUrl.value = null;
  pendingSlot = null;
  pendingUrl = null;
  cleanupSlot(0);
  cleanupSlot(1);
}

function scheduleSlotCleanup(slot: VideoSlot): void {
  clearTimeout(cleanupTimers[slot]);
  cleanupTimers[slot] = setTimeout(() => {
    if (visibleSlot.value !== slot && pendingSlot !== slot) cleanupSlot(slot);
  }, VIDEO_CROSSFADE_MS);
}

async function loadVideo(url: string | null): Promise<void> {
  if (!url) return;

  const token = ++loadToken;
  setLoading(true);
  const targetSlot: VideoSlot = visibleSlot.value === 0 ? 1 : 0;
  pendingSlot = targetSlot;
  pendingUrl = url;
  cleanupSlot(targetSlot);

  const source = await loadBackgroundVideoSource(url);
  const video = getVideoElement(targetSlot);
  if (token !== loadToken || pendingSlot !== targetSlot || !video) {
    source.release();
    return;
  }

  loadedSources[targetSlot] = source;
  video.src = source.src;
  video.load();

  await nextTick();
  if (token !== loadToken) return;
}

async function handleCanPlay(slot: VideoSlot): Promise<void> {
  const video = getVideoElement(slot);
  const url = pendingUrl;
  if (!video || pendingSlot !== slot || !url) return;

  await video.play().catch(() => undefined);
  if (pendingSlot !== slot || pendingUrl !== url) return;

  const previousSlot = visibleSlot.value;
  visibleSlot.value = slot;
  visibleVideoUrl.value = url;
  pendingSlot = null;
  pendingUrl = null;
  setLoading(false);

  if (pendingVideoUrl.value === url) {
    commitVideo(url);
  }

  if (previousSlot !== null && previousSlot !== slot) {
    scheduleSlotCleanup(previousSlot);
  }
}

function handleError(slot: VideoSlot): void {
  if (pendingSlot !== slot) return;
  cleanupSlot(slot);
  pendingSlot = null;
  pendingUrl = null;
  rejectVideo();
}

watch(
  requestedVideoUrl,
  (url) => {
    if (!url) {
      ++loadToken;
      resetVideos();
      setLoading(false);
      return;
    }
    if (url === visibleVideoUrl.value) return;
    void nextTick(() => loadVideo(url));
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  ++loadToken;
  resetVideos();
  setLoading(false);
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
      ref="firstVideoElement"
      class="tools-background__video"
      :class="{ 'is-active': visibleSlot === 0 }"
      preload="none"
      muted
      loop
      playsinline
      @canplay="handleCanPlay(0)"
      @error="handleError(0)"
    ></video>
    <video
      ref="secondVideoElement"
      class="tools-background__video"
      :class="{ 'is-active': visibleSlot === 1 }"
      preload="none"
      muted
      loop
      playsinline
      @canplay="handleCanPlay(1)"
      @error="handleError(1)"
    ></video>
    <div class="tools-background__scrim"></div>
  </div>
</template>
