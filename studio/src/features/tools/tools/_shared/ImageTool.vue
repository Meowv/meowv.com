<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue';
import '@/features/image/image.css';

type ImageToolMode =
  | 'compress'
  | 'convert'
  | 'resize'
  | 'crop'
  | 'watermark'
  | 'rounded'
  | 'padding'
  | 'images-to-pdf'
  | 'merge-gif'
  | 'psd-viewer';

const props = defineProps<{
  mode: ImageToolMode;
}>();

const loaders: Record<ImageToolMode, () => Promise<{ default: Component }>> = {
  compress: () => import('@/features/image/views/BatchToolView.vue'),
  convert: () => import('@/features/image/views/BatchToolView.vue'),
  resize: () => import('@/features/image/views/BatchToolView.vue'),
  crop: () => import('@/features/image/views/CropView.vue'),
  watermark: () => import('@/features/image/views/ImageEffectsView.vue'),
  rounded: () => import('@/features/image/views/ImageEffectsView.vue'),
  padding: () => import('@/features/image/views/ImageEffectsView.vue'),
  'images-to-pdf': () => import('@/features/image/views/ImagesToPdfView.vue'),
  'merge-gif': () => import('@/features/image/views/MergeGifView.vue'),
  'psd-viewer': () => import('@/features/image/views/PsdViewerView.vue'),
};

const activeComponent = computed(() => defineAsyncComponent(loaders[props.mode]));
const activeProps = computed(() =>
  ['compress', 'convert', 'resize', 'watermark', 'rounded', 'padding'].includes(props.mode)
    ? { mode: props.mode, embedded: true }
    : { embedded: true },
);
</script>

<template>
  <div class="image-feature tools-embedded-feature tools-embedded-feature--image">
    <component :is="activeComponent" :key="mode" v-bind="activeProps" />
  </div>
</template>
