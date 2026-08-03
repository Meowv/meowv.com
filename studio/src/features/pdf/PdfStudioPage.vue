<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { IconArrowLeft, IconFileUnknown } from '@tabler/icons-vue';
import PdfHub from '@/features/pdf/PdfHub.vue';
import PdfToolPage from '@/features/pdf/PdfToolPage.vue';
import { getToolBySlug } from '@/features/pdf/config/tools';
import '@/features/pdf/pdf.css';

const route = useRoute();
const slug = computed(() => String(route.params.tool ?? ''));
const toolExists = computed(() => !slug.value || Boolean(getToolBySlug(slug.value)));
</script>

<template>
  <div class="pdf-studio">
    <PdfHub v-if="!slug" />
    <PdfToolPage v-else-if="toolExists" :slug="slug" />
    <section v-else class="pdf-missing-tool">
      <IconFileUnknown :size="46" stroke-width="1.5" aria-hidden="true" />
      <p class="eyebrow">PDF STUDIO</p>
      <h1>没有找到这个 PDF 工具</h1>
      <p>工具地址可能已经变化，返回 PDF 工具中心重新选择即可。</p>
      <RouterLink class="button button--primary" to="/pdf">
        <IconArrowLeft :size="18" />
        返回全部工具
      </RouterLink>
    </section>
  </div>
</template>
