<script setup lang="ts">
import { computed, ref } from 'vue';
import DonationDialog from '../components/DonationDialog.vue';
import ThemeCycleButton from '../components/ThemeCycleButton.vue';
import { onCreateNew, onOpenDocument } from '../../lib/document';
import { formats, type OfficeFormat } from '../office-formats';

const props = defineProps<{ format: OfficeFormat }>();
const currentFormat = computed(() => formats[props.format]);
const donationOpen = ref(false);

const openDocument = () => onOpenDocument(`.${currentFormat.value.extension}`);
const createDocument = () => {
  if (currentFormat.value.canCreate) void onCreateNew(`.${currentFormat.value.extension}`);
};
</script>

<template>
  <header class="site-header">
    <div class="wrap site-header__inner">
      <RouterLink class="brand" to="/">
        <img class="brand-mark" src="/brand/office-mark.svg" alt="" />
        <span class="brand-copy"><b>Meowv Office</b></span>
      </RouterLink>
      <div class="header-actions">
        <button class="support-button" type="button" @click="donationOpen = true">捐赠支持</button><ThemeCycleButton />
      </div>
    </div>
  </header>

  <main class="format-page wrap">
    <span class="format-badge" :class="`format-badge--${currentFormat.className}`">{{ currentFormat.badge }}</span>
    <p class="eyebrow">{{ currentFormat.extension }} · {{ currentFormat.shortName }}</p>
    <h1>在浏览器本地打开和编辑 {{ currentFormat.name }}</h1>
    <p class="lead">{{ currentFormat.description }} 文件内容始终留在当前设备，不经过上传或服务端转换。</p>
    <div class="hero-actions">
      <button class="button button--primary" type="button" @click="openDocument">
        打开 {{ currentFormat.extension.toUpperCase() }}
      </button>
      <button v-if="currentFormat.canCreate" class="button" type="button" @click="createDocument">
        新建 {{ currentFormat.shortName }}
      </button>
    </div>
    <p class="notice">{{ currentFormat.limitation }} 保存后建议重新打开关键文件核对内容。</p>

    <section class="format-help">
      <article>
        <b>1</b>
        <div>
          <h2>选择本地文件</h2>
          <p>点击打开按钮，或从首页拖入一个 {{ currentFormat.extension.toUpperCase() }} 文件。</p>
        </div>
      </article>
      <article>
        <b>2</b>
        <div>
          <h2>在浏览器中编辑</h2>
          <p>编辑器与转换资源按需在本地加载，无需登录或安装桌面软件。</p>
        </div>
      </article>
      <article>
        <b>3</b>
        <div>
          <h2>保存回设备</h2>
          <p>通过文件选择器授权打开的文件会自动回写原文件；其他浏览器可从编辑器导出新版本。</p>
        </div>
      </article>
    </section>
  </main>
  <DonationDialog :open="donationOpen" @close="donationOpen = false" />
</template>
