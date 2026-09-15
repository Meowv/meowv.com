<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { IconWindmill } from '@tabler/icons-vue';
import { useToolsBackground } from '@/features/tools/composables/useToolsBackground';

const {
  randomShortcutEnabled,
  isLoading: backgroundLoading,
  requestSequence: backgroundRequestSequence,
  requestRandomVideo,
} = useToolsBackground();
const windmillRotating = ref(false);
let windmillTimer: ReturnType<typeof setTimeout> | undefined;
let windmillMinimumElapsed = true;
let windmillRequestPending = false;
const WINDMILL_MINIMUM_ROTATION_MS = 720;

const visible = computed(() => randomShortcutEnabled.value);

function stopWindmillWhenReady(): void {
  if (windmillMinimumElapsed && !windmillRequestPending && !backgroundLoading.value) {
    windmillRotating.value = false;
  }
}

function startWindmillRotation(): void {
  clearTimeout(windmillTimer);
  windmillMinimumElapsed = false;
  windmillRotating.value = true;
  windmillTimer = setTimeout(() => {
    windmillMinimumElapsed = true;
    stopWindmillWhenReady();
  }, WINDMILL_MINIMUM_ROTATION_MS);
}

async function triggerRandomBackground(): Promise<void> {
  if (backgroundLoading.value) return;
  windmillRequestPending = true;
  try {
    await requestRandomVideo();
    await nextTick();
  } finally {
    windmillRequestPending = false;
    stopWindmillWhenReady();
  }
}

watch(backgroundRequestSequence, startWindmillRotation, { flush: 'sync' });

watch(backgroundLoading, (loading) => {
  if (loading) windmillRotating.value = true;
  else stopWindmillWhenReady();
});

onBeforeUnmount(() => {
  clearTimeout(windmillTimer);
});
</script>

<template>
  <button
    v-if="visible"
    class="tools-background-shortcut"
    :class="{ 'is-rotating': windmillRotating }"
    type="button"
    aria-label="随机切换视频背景"
    title="随机切换视频背景"
    :aria-busy="backgroundLoading"
    :disabled="backgroundLoading"
    @click="triggerRandomBackground"
  >
    <IconWindmill class="tools-windmill-icon" :size="18" aria-hidden="true" />
  </button>
</template>

<style>
.tools-background-shortcut {
  position: absolute;
  z-index: 14;
  top: 14px;
  right: 20px;
  display: grid;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  place-items: center;
  color: var(--tools-accent, var(--menu-tools-foreground));
  cursor: pointer;
}

.tools-background-shortcut:focus-visible {
  outline: 2px solid color-mix(in srgb, currentColor 52%, transparent);
  outline-offset: 2px;
}

.tools-windmill-icon path:nth-of-type(1) {
  stroke: #ff5d73;
}

.tools-windmill-icon path:nth-of-type(2) {
  stroke: #ffb224;
}

.tools-windmill-icon path:nth-of-type(3) {
  stroke: #20b875;
}

.tools-windmill-icon path:nth-of-type(4) {
  stroke: #4388f7;
}

.tools-background-shortcut:disabled {
  cursor: wait;
  opacity: 0.72;
}

.tools-background-shortcut.is-rotating > svg {
  animation: tools-background-windmill 720ms linear infinite;
}

@keyframes tools-background-windmill {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(1turn);
  }
}
</style>
