<script setup lang="ts">
import type { LivewallPromoModel } from './useLivewallPromo';

defineProps<{ model: LivewallPromoModel }>();
</script>

<template>
  <!--
    灯箱右侧竖排操作列的最后一项。
    刻意**不**依赖「设为壁纸」相关的 computed：那个是把视频设成网页背景，
    这里是把壁纸设成系统壁纸（需要装 App），两者语义不同。
  -->
  <a
    v-if="model.downloadUrl"
    class="wallpapers-lightbox-download-trigger is-app"
    :href="model.downloadUrl"
    target="_blank"
    rel="noopener noreferrer"
    :title="`下载 ${model.cta.title} App`"
    :aria-label="`下载 ${model.cta.title} App`"
  >
    <component :is="model.icon" :size="18" />
  </a>
  <button
    v-else
    class="wallpapers-lightbox-download-trigger is-app"
    type="button"
    disabled
    :title="model.cta.description"
    :aria-label="model.cta.description"
  >
    <component :is="model.icon" :size="18" />
  </button>
</template>
