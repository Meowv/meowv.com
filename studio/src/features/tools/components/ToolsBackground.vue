<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useToolsBackground } from '@/features/tools/composables/useToolsBackground';
import type { ToolsBackgroundSource } from '@/features/tools/composables/useToolsBackground';

const {
  activeSource,
  pendingSource,
  opacity,
  blur,
  requestSequence,
  setLoading,
  commitBackground,
  rejectBackground,
} = useToolsBackground();

type VideoSlot = 0 | 1;

const firstVideoElement = ref<HTMLVideoElement | null>(null);
const secondVideoElement = ref<HTMLVideoElement | null>(null);
const visibleSlot = ref<VideoSlot | null>(null);
const visibleVideoUrl = ref<string | null>(null);
let loadToken = 0;
let pendingSlot: VideoSlot | null = null;
let pendingLoadSource: ToolsBackgroundSource | null = null;
const cleanupTimers: [
  ReturnType<typeof setTimeout> | undefined,
  ReturnType<typeof setTimeout> | undefined,
] = [undefined, undefined];
const VIDEO_CROSSFADE_MS = 280;

const requestedSource = computed(() => pendingSource.value ?? activeSource.value);
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
}

function resetVideos(): void {
  visibleSlot.value = null;
  visibleVideoUrl.value = null;
  pendingSlot = null;
  pendingLoadSource = null;
  cleanupSlot(0);
  cleanupSlot(1);
}

function scheduleSlotCleanup(slot: VideoSlot): void {
  clearTimeout(cleanupTimers[slot]);
  cleanupTimers[slot] = setTimeout(() => {
    if (visibleSlot.value !== slot && pendingSlot !== slot) cleanupSlot(slot);
  }, VIDEO_CROSSFADE_MS);
}

async function loadVideo(source: ToolsBackgroundSource | null): Promise<void> {
  if (!source) return;

  const token = ++loadToken;
  setLoading(true);
  const targetSlot: VideoSlot = visibleSlot.value === 0 ? 1 : 0;
  pendingSlot = targetSlot;
  pendingLoadSource = source;
  cleanupSlot(targetSlot);

  const video = getVideoElement(targetSlot);
  if (token !== loadToken || pendingSlot !== targetSlot || !video) {
    return;
  }

  video.src = source.videoUrl;
  video.load();

  await nextTick();
  if (token !== loadToken) return;
}

async function handleCanPlay(slot: VideoSlot): Promise<void> {
  const video = getVideoElement(slot);
  const source = pendingLoadSource;
  if (!video || pendingSlot !== slot || !source) return;

  await video.play().catch(() => undefined);
  if (pendingSlot !== slot || pendingLoadSource !== source) return;

  const previousSlot = visibleSlot.value;
  visibleSlot.value = slot;
  visibleVideoUrl.value = source.videoUrl;
  pendingSlot = null;
  pendingLoadSource = null;
  setLoading(false);

  if (pendingSource.value && pendingSource.value.videoUrl === source.videoUrl) {
    commitBackground(source);
  }

  if (previousSlot !== null && previousSlot !== slot) {
    scheduleSlotCleanup(previousSlot);
  }
}

function handleError(slot: VideoSlot): void {
  if (pendingSlot !== slot) return;
  const source = pendingLoadSource;
  cleanupSlot(slot);
  pendingSlot = null;
  pendingLoadSource = null;
  rejectBackground(undefined, source ?? undefined);
}

watch(
  [requestedSource, requestSequence],
  ([source]) => {
    if (!source) {
      ++loadToken;
      resetVideos();
      setLoading(false);
      return;
    }
    if (source.videoUrl === visibleVideoUrl.value) {
      if (pendingLoadSource) {
        ++loadToken;
        const staleSlot = pendingSlot;
        pendingSlot = null;
        pendingLoadSource = null;
        if (staleSlot !== null) cleanupSlot(staleSlot);
      }
      return;
    }
    void nextTick(() => loadVideo(source));
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
    v-if="requestedSource"
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
      referrerpolicy="no-referrer"
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
      referrerpolicy="no-referrer"
      @canplay="handleCanPlay(1)"
      @error="handleError(1)"
    ></video>
    <div class="tools-background__scrim"></div>
  </div>
</template>

<style>
.tools-background {
  position: fixed;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  opacity: 0;
  transition: opacity 260ms ease;
}

.tools-background--ready {
  opacity: 1;
}

.tools-background__video {
  position: absolute;
  width: calc(100% + 48px);
  height: calc(100% + 48px);
  top: -24px;
  left: -24px;
  object-fit: cover;
  filter: blur(var(--tools-background-blur));
  opacity: 0;
  transform: scale(1.04);
  transition: opacity 260ms ease;
}

.tools-background__video.is-active {
  opacity: var(--tools-background-opacity);
}

.tools-background__scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--color-bg) 40%, transparent);
}
</style>
