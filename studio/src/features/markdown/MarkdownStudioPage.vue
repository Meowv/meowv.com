<script setup lang="ts">
import MarkdownWorkspace from '@/features/markdown/MarkdownWorkspace.vue';
import '@/features/markdown/markdown.css';
import { useTheme } from '@/composables/useTheme';

const { resolved } = useTheme();
</script>

<template>
  <section
    class="markdown-studio"
    :class="{ 'markdown-studio--dark': resolved === 'dark' }"
    aria-label="Markdown 工作台"
  >
    <MarkdownWorkspace />
  </section>
</template>
