<script setup lang="ts">
import { IconHeart } from '@tabler/icons-vue';

const emit = defineEmits<{ support: [] }>();
</script>

<template>
  <footer class="studio-footer">
    <div class="studio-footer__inner">
      <div class="studio-footer__brand">
        <RouterLink
          class="studio-footer__wordmark home-copy__product--animated"
          to="/"
          aria-label="返回 Meowv Studio 首页"
          ><strong>Meowv</strong> Studio</RouterLink
        >
        <span>专注浏览器处理的本地文件工作台</span>
      </div>

      <nav class="studio-footer__links" aria-label="页脚链接">
        <a href="https://zt.meowv.com" target="_blank" rel="noreferrer">✍️ 字帖生成</a>
        <button type="button" @click="emit('support')">
          <IconHeart :size="18" stroke-width="1.9" aria-hidden="true" />
          赞助支持
        </button>
      </nav>
    </div>
  </footer>
</template>
