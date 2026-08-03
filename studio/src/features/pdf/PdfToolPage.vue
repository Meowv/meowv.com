<script setup lang="ts">
import { computed } from 'vue';
import AppToolIcon from '@/features/pdf/components/common/AppToolIcon.vue';
import ToolRunner from '@/features/pdf/components/tools/ToolRunner.vue';
import { getToolBySlug } from '@/features/pdf/config/tools';
import { usePageMeta } from '@/composables/usePageMeta';

const props = defineProps<{ slug: string }>();
const tool = computed(() => getToolBySlug(props.slug));
const canonical = computed(() => `https://studio.meowv.com/pdf/${props.slug}`);
usePageMeta({
  title: () => tool.value?.seo.title ?? 'PDF · Meowv Studio',
  description: () => tool.value?.seo.description ?? '浏览器本地 PDF 工具。',
  canonical,
});
</script>

<template>
  <div v-if="tool" class="tool-page">
    <section class="tool-page-header">
      <div class="container">
        <header class="tool-page__intro">
          <span class="tool-page__icon" aria-hidden="true">
            <AppToolIcon :name="tool.icon" :size="27" />
          </span>
          <div>
            <h1>{{ tool.name }}</h1>
            <p>{{ tool.description }}</p>
          </div>
        </header>
      </div>
    </section>

    <div class="container tool-page__body">
      <ToolRunner :key="tool.slug" :slug="tool.slug" />
    </div>
  </div>
</template>
