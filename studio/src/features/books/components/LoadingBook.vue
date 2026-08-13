<script setup lang="ts">
import { IconBook2 } from '@tabler/icons-vue';
</script>

<template>
  <section class="books-loading" aria-live="polite" aria-label="正在打开本地书籍">
    <div class="books-loading__book" aria-hidden="true">
      <IconBook2 :size="58" stroke-width="1.2" />
      <span></span>
      <span></span>
      <span></span>
    </div>
    <strong>正在整理书页…</strong>
    <p>封面和第一页准备好后，书就会出现</p>
  </section>
</template>
