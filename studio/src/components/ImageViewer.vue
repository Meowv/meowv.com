<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { IconX } from '@tabler/icons-vue';

const props = defineProps<{ src: string; alt?: string; modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const closeButton = ref<HTMLButtonElement>();
const imageElement = ref<HTMLImageElement>();
const scale = ref(1);
const originX = ref(50);
const originY = ref(50);
let lastActiveElement: HTMLElement | null = null;

const MIN_SCALE = 1;
const MAX_SCALE = 8;

function close(): void {
  emit('update:modelValue', false);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

function resetState(): void {
  document.removeEventListener('keydown', handleKeydown);
  document.body.classList.remove('has-dialog-open');
}

function handleWheel(event: WheelEvent): void {
  const image = imageElement.value;
  if (!image) return;
  event.preventDefault();
  const rect = image.getBoundingClientRect();
  originX.value = ((event.clientX - rect.left) / rect.width) * 100;
  originY.value = ((event.clientY - rect.top) / rect.height) * 100;
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
  scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * factor));
}

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (!isOpen) {
      scale.value = 1;
      originX.value = 50;
      originY.value = 50;
      resetState();
      lastActiveElement?.focus();
      lastActiveElement = null;
      return;
    }
    lastActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('has-dialog-open');
    document.addEventListener('keydown', handleKeydown);
    await nextTick();
    closeButton.value?.focus();
  },
);

onBeforeUnmount(resetState);
</script>

<template>
  <Teleport to="body">
    <Transition name="image-viewer">
      <div
        v-if="modelValue"
        class="image-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="查看大图"
        @click.self="emit('update:modelValue', false)"
      >
        <img
          ref="imageElement"
          class="image-viewer__image"
          :class="{ 'image-viewer__image--zoomed': scale > 1 }"
          :src="src"
          :alt="alt"
          draggable="false"
          :style="{
            transform: `scale(${scale})`,
            transformOrigin: `${originX}% ${originY}%`,
          }"
          @wheel="handleWheel"
        />
        <button
          ref="closeButton"
          class="image-viewer__close"
          type="button"
          title="关闭大图"
          aria-label="关闭大图"
          @click="emit('update:modelValue', false)"
        >
          <IconX :size="22" stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-viewer {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 28px;
  overflow: hidden;
  background: rgb(12 14 20 / 84%);
  cursor: zoom-out;
}

.image-viewer__image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  box-shadow: 0 24px 64px rgb(0 0 0 / 45%);
  cursor: default;
  user-select: none;
  transition:
    transform 90ms ease-out,
    box-shadow 180ms ease;
}

.image-viewer__image--zoomed {
  cursor: grab;
  box-shadow: 0 24px 64px rgb(0 0 0 / 60%);
}

.image-viewer__close {
  position: fixed;
  top: 16px;
  right: 16px;
  display: grid;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 24%);
  border-radius: 999px;
  background: rgb(0 0 0 / 42%);
  color: #f5f5f5;
  cursor: pointer;
  place-items: center;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.image-viewer__close:hover,
.image-viewer__close:focus-visible {
  border-color: rgb(255 255 255 / 64%);
  background: rgb(0 0 0 / 66%);
  transform: scale(1.06);
}

.image-viewer-enter-active,
.image-viewer-leave-active {
  transition:
    opacity 180ms ease,
    background 180ms ease;
}

.image-viewer-enter-from,
.image-viewer-leave-to {
  opacity: 0;
}
</style>
