<script setup lang="ts">
import ToolRunner from '@/features/pdf/components/tools/ToolRunner.vue';
import '@/features/pdf/pdf.css';

defineProps<{
  slug: string;
}>();
</script>

<template>
  <div class="pdf-studio tools-embedded-feature tools-embedded-feature--pdf">
    <div class="container tool-page__body">
      <ToolRunner :key="slug" :slug="slug" />
    </div>
  </div>
</template>
