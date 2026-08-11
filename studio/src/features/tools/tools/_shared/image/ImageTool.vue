<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  type Component,
} from 'vue';
import { handoffFile, receiveWindowFileHandoff } from '@/core/browser/file-handoff';
import '@/features/tools/tools/_shared/image/image.css';

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
const handoffVersion = ref(0);
let stopWindowFileHandoff: () => void = () => undefined;

const loaders: Record<ImageToolMode, () => Promise<{ default: Component }>> = {
  compress: () => import('@/features/tools/tools/_shared/image/views/BatchToolView.vue'),
  convert: () => import('@/features/tools/tools/_shared/image/views/BatchToolView.vue'),
  resize: () => import('@/features/tools/tools/_shared/image/views/BatchToolView.vue'),
  crop: () => import('@/features/tools/tools/_shared/image/views/CropView.vue'),
  watermark: () => import('@/features/tools/tools/_shared/image/views/ImageEffectsView.vue'),
  rounded: () => import('@/features/tools/tools/_shared/image/views/ImageEffectsView.vue'),
  padding: () => import('@/features/tools/tools/_shared/image/views/ImageEffectsView.vue'),
  'images-to-pdf': () => import('@/features/tools/tools/_shared/image/views/ImagesToPdfView.vue'),
  'merge-gif': () => import('@/features/tools/tools/_shared/image/views/MergeGifView.vue'),
  'psd-viewer': () => import('@/features/tools/tools/_shared/image/views/PsdViewerView.vue'),
};

const activeComponent = computed(() => defineAsyncComponent(loaders[props.mode]));
const activeProps = computed(() =>
  ['compress', 'convert', 'resize', 'watermark', 'rounded', 'padding'].includes(props.mode)
    ? { mode: props.mode, embedded: true }
    : { embedded: true },
);

onMounted(() => {
  if (props.mode === 'psd-viewer') return;
  stopWindowFileHandoff = receiveWindowFileHandoff('image', (file) => {
    handoffFile(file, 'image');
    handoffVersion.value += 1;
  });
});

onBeforeUnmount(() => stopWindowFileHandoff());
</script>

<template>
  <div class="image-feature tools-embedded-feature tools-embedded-feature--image">
    <component :is="activeComponent" :key="`${mode}-${handoffVersion}`" v-bind="activeProps" />
  </div>
</template>
