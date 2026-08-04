<script setup lang="ts">
import { IconHeartFilled, IconStarFilled } from '@tabler/icons-vue';
import ThemeToggle from '@/components/ThemeToggle.vue';

const emit = defineEmits<{ support: [] }>();
</script>

<template>
  <footer class="studio-footer">
    <div class="studio-footer__inner">
      <div class="studio-footer__brand">
        <RouterLink class="studio-footer__wordmark" to="/" aria-label="返回 Meowv Studio 首页">
          <span class="home-copy__product--animated"><strong>Meowv</strong> Studio</span>
          <span class="studio-logo__leaf" aria-hidden="true">●</span>
        </RouterLink>
        <span>专注浏览器处理的本地文件工作台</span>
      </div>

      <nav class="studio-footer__links" aria-label="页脚链接">
        <a href="https://zt.meowv.com" target="_blank" rel="noreferrer">✍️ 字帖生成</a>
        <a href="https://meowv.com" target="_blank" rel="noreferrer"
          ><IconStarFilled :size="18" stroke-width="1.9" aria-hidden="true" />阿星𝑷𝒍𝒖𝒔</a
        >
        <button type="button" @click="emit('support')">
          <IconHeartFilled :size="18" stroke-width="1.9" aria-hidden="true" />
          赞助支持
        </button>
        <ThemeToggle />
      </nav>
    </div>
  </footer>
</template>
