<script setup lang="ts">
import { IconBook, IconFolderOpen } from '@tabler/icons-vue';

defineProps<{
  dragging: boolean;
}>();

defineEmits<{
  pick: [];
}>();
</script>

<template>
  <section class="books-welcome" aria-labelledby="books-welcome-title">
    <div class="books-welcome__aura" aria-hidden="true"></div>
    <div class="books-welcome__book" aria-hidden="true">
      <div class="books-welcome__back-cover"></div>
      <div class="books-welcome__pages"></div>
      <div class="books-welcome__front-cover">
        <IconBook :size="46" stroke-width="1.25" />
        <span>MEOWV</span>
      </div>
      <div class="books-welcome__spine"></div>
    </div>

    <div class="books-welcome__copy">
      <h1 id="books-welcome-title">打开一本书</h1>
      <p>选择本地书籍，剩下的交给它。</p>
      <button type="button" class="books-welcome__action" @click="$emit('pick')">
        <IconFolderOpen :size="20" aria-hidden="true" />
        选择本地书籍
      </button>
      <span class="books-welcome__formats">PDF · EPUB · TXT · MOBI · AZW3 · FB2 · CBZ</span>
      <small>文件仅在当前浏览器中处理，不会离开你的设备</small>
    </div>

    <div v-if="dragging" class="books-drop-curtain" aria-live="polite">
      <IconBook :size="44" stroke-width="1.35" aria-hidden="true" />
      <strong>松手，打开这本书</strong>
      <span>支持 PDF、EPUB、TXT、MOBI、AZW3、FB2 和 CBZ</span>
    </div>
  </section>
</template>
