<script setup lang="ts">
import { computed, ref } from 'vue';
import ImageViewer from '@/components/ImageViewer.vue';
import { renderNoteMarkdown } from '@/features/notes/services/markdown';

const props = defineProps<{ content: string }>();

const html = computed(() => renderNoteMarkdown(props.content));
const viewerOpen = ref(false);
const viewerImage = ref<{ src: string; alt: string } | null>(null);

function onPreviewClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLImageElement) || target.closest('a')) return;
  viewerImage.value = {
    src: target.currentSrc || target.src,
    alt: target.alt || '',
  };
  viewerOpen.value = true;
}
</script>

<template>
  <div class="note-preview" aria-label="便签渲染预览" @click="onPreviewClick" v-html="html"></div>
  <ImageViewer
    v-if="viewerImage"
    v-model="viewerOpen"
    :src="viewerImage.src"
    :alt="viewerImage.alt"
  />
</template>
