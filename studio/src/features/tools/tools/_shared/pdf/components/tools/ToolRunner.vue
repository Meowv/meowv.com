<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue';

const props = defineProps<{
  slug: string;
}>();

const loaders: Record<string, () => Promise<{ default: Component }>> = {
  'merge-pdf': () => import('./MergeTool.vue'),
  'split-pdf': () => import('./SplitTool.vue'),
  'organize-pdf': () => import('./PageTool.vue'),
  'delete-pdf-pages': () => import('./PageTool.vue'),
  'extract-pdf-pages': () => import('./PageTool.vue'),
  'rotate-pdf': () => import('./PageTool.vue'),
  'pdf-to-images': () => import('./PdfToImagesTool.vue'),
  'watermark-pdf': () => import('./WatermarkTool.vue'),
  'add-pdf-page-numbers': () => import('./PageNumbersTool.vue'),
  'pdf-metadata': () => import('./MetadataTool.vue'),
};

const modes = {
  'organize-pdf': 'organize',
  'delete-pdf-pages': 'delete',
  'extract-pdf-pages': 'extract',
  'rotate-pdf': 'rotate',
} as const;

const loader = loaders[props.slug];
if (!loader) {
  throw new Error('工具不存在');
}
const activeComponent = defineAsyncComponent(loader);
const activeProps = computed(() =>
  props.slug in modes ? { mode: modes[props.slug as keyof typeof modes] } : {},
);
</script>

<template>
  <component :is="activeComponent" v-bind="activeProps" />
</template>
