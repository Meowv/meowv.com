<script setup lang="ts">
import AppFooter from "~/components/layout/AppFooter.vue";
import AppHeader from "~/components/layout/AppHeader.vue";
</script>

<template>
  <div class="site-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <AppHeader />
    <main id="main-content" class="site-main">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
