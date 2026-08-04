<script setup lang="ts">
import { computed, defineAsyncComponent, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import {
  IconAdjustments,
  IconBrandAdobePhotoshop,
  IconCrop,
  IconFileTypePdf,
  IconMovie,
  IconPhotoDown,
  IconPhotoEdit,
  IconPhotoScan,
  IconPhotoUp,
  IconResize,
} from '@tabler/icons-vue';
import './image.css';

const route = useRoute();

const BatchToolView = defineAsyncComponent(() => import('./views/BatchToolView.vue'));
const CropView = defineAsyncComponent(() => import('./views/CropView.vue'));
const ImageEffectsView = defineAsyncComponent(() => import('./views/ImageEffectsView.vue'));
const ImagesToPdfView = defineAsyncComponent(() => import('./views/ImagesToPdfView.vue'));
const MergeGifView = defineAsyncComponent(() => import('./views/MergeGifView.vue'));
const PsdViewerView = defineAsyncComponent(() => import('./views/PsdViewerView.vue'));

const tools = [
  {
    slug: 'compress',
    name: '图片压缩',
    description: '降低体积，保留清晰画质。',
    icon: IconPhotoDown,
  },
  {
    slug: 'convert',
    name: '格式转换',
    description: '转换 PNG、JPEG、WebP、ICO 与 SVG。',
    icon: IconPhotoUp,
  },
  {
    slug: 'resize',
    name: '尺寸调整',
    description: '按宽高、百分比或最大边批量缩放。',
    icon: IconResize,
  },
  { slug: 'crop', name: '图片裁剪', description: '自由比例、常用尺寸与精确导出。', icon: IconCrop },
  {
    slug: 'watermark',
    name: '添加水印',
    description: '文字、Logo、位置、旋转与平铺。',
    icon: IconPhotoEdit,
  },
  {
    slug: 'rounded',
    name: '添加圆角',
    description: '统一或独立圆角，保留透明背景。',
    icon: IconPhotoScan,
  },
  {
    slug: 'padding',
    name: '补边留白',
    description: '四边边距、纯色、透明或渐变背景。',
    icon: IconAdjustments,
  },
  {
    slug: 'images-to-pdf',
    name: '图片转 PDF',
    description: '多图排序并生成常用纸张 PDF。',
    icon: IconFileTypePdf,
  },
  {
    slug: 'merge-gif',
    name: '合并为 GIF',
    description: '设置帧率、画布、背景与循环。',
    icon: IconMovie,
  },
  {
    slug: 'psd-viewer',
    name: 'PSD 查看',
    description: '本地解析 Photoshop 合成图并导出预览。',
    icon: IconBrandAdobePhotoshop,
  },
] as const;

const tool = computed(() => String(route.params.tool ?? ''));

const activeView = computed(() => {
  if (tool.value === 'compress' || tool.value === 'convert' || tool.value === 'resize') {
    return { component: BatchToolView, props: { mode: tool.value } };
  }
  if (tool.value === 'crop') return { component: CropView, props: {} };
  if (tool.value === 'watermark' || tool.value === 'rounded' || tool.value === 'padding') {
    return { component: ImageEffectsView, props: { mode: tool.value } };
  }
  if (tool.value === 'images-to-pdf') return { component: ImagesToPdfView, props: {} };
  if (tool.value === 'merge-gif') return { component: MergeGifView, props: {} };
  if (tool.value === 'psd-viewer') return { component: PsdViewerView, props: {} };
  return null;
});

watchEffect(() => {
  const current = tools.find((item) => item.slug === tool.value);
  document.title = current ? `${current.name} · Meowv Studio` : 'Image · Meowv Studio';
});
</script>

<template>
  <div class="image-feature">
    <component :is="activeView.component" v-if="activeView" v-bind="activeView.props" />
    <section v-else class="tool-hub">
      <nav class="tool-hub__grid" aria-label="图片工具">
        <RouterLink
          v-for="item in tools"
          :key="item.slug"
          class="tool-hub__card"
          :to="`/image/${item.slug}`"
        >
          <span class="tool-hub__card-icon" aria-hidden="true">
            <component :is="item.icon" :size="23" stroke-width="1.8" />
          </span>
          <span class="tool-hub__card-content">
            <strong>{{ item.name }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <span class="tool-hub__card-arrow" aria-hidden="true">→</span>
        </RouterLink>
      </nav>
    </section>
  </div>
</template>
