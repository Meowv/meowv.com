<script setup lang="ts">
import { ArrowLeft, FileQuestion } from "@lucide/vue";

import AppLogo from "@/components/common/AppLogo.vue";
</script>

<template>
  <div class="not-found">
    <header>
      <AppLogo compact />
    </header>
    <main>
      <span class="not-found__icon"><FileQuestion :size="30" :stroke-width="1.6" /></span>
      <p class="not-found__code">404</p>
      <h1>找不到这个页面</h1>
      <p>链接可能已失效，或者对应的工作簿已被删除。</p>
      <RouterLink to="/">
        <ArrowLeft :size="18" />
        返回工作簿首页
      </RouterLink>
    </main>
  </div>
</template>

<style scoped>
.not-found {
  min-height: 100dvh;
  background: var(--app-bg);
  color: var(--text-strong);
}

header {
  display: flex;
  height: 64px;
  align-items: center;
  padding: 0 clamp(22px, 4vw, 56px);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

main {
  display: grid;
  min-height: calc(100dvh - 64px);
  padding: 48px 24px 96px;
  place-items: center;
  align-content: center;
  text-align: center;
}

.not-found__icon {
  display: grid;
  width: 58px;
  height: 58px;
  margin-bottom: 16px;
  border: 1px solid var(--primary-border);
  border-radius: 9px;
  background: var(--primary-surface);
  color: var(--primary-text);
  place-items: center;
}

.not-found__code {
  margin: 0 0 8px;
  color: var(--primary-text);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 710;
  letter-spacing: -0.025em;
}

main > p:not(.not-found__code) {
  margin: 12px 0 24px;
  color: var(--text-tertiary);
  font-size: 14px;
}

main a {
  display: inline-flex;
  height: 42px;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid var(--primary-600);
  border-radius: 6px;
  background: var(--primary-600);
  color: var(--on-accent);
  font-size: 14px;
  font-weight: 650;
  text-decoration: none;
}

main a:hover {
  border-color: var(--primary-700);
  background: var(--primary-700);
}

main a:focus-visible {
  outline: 3px solid rgb(22 163 74 / 20%);
  outline-offset: 3px;
}
</style>
