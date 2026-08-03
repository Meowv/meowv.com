<script setup lang="ts">
import ToolCard from '@/features/pdf/components/common/ToolCard.vue';
import { pdfTools } from '@/features/pdf/config/tools';
import { usePageMeta } from '@/composables/usePageMeta';

usePageMeta({
  title: 'PDF · Meowv Studio',
  description:
    '在浏览器本地完成 PDF 合并、拆分、整理、转换、水印、页码与元数据编辑，文件无需上传。',
  canonical: 'https://studio.meowv.com/pdf',
});
</script>

<template>
  <div class="tool-hub">
    <nav class="tool-hub__grid" aria-label="PDF">
      <ToolCard v-for="tool in pdfTools" :key="tool.slug" :tool="tool" />
    </nav>
  </div>
</template>
