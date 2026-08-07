<script setup lang="ts">
import { computed } from 'vue';
import { renderNoteMarkdown } from '@/features/notes/services/markdown';

const props = defineProps<{ content: string }>();

const html = computed(() => renderNoteMarkdown(props.content));
</script>

<template>
  <div class="note-preview" aria-label="便签渲染预览" v-html="html"></div>
</template>
