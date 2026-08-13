<template>
  <div class="text-json-diff-loading" role="status" aria-live="polite" aria-busy="true">
    <span class="text-json-diff-loading__spinner" aria-hidden="true"></span>
    <span>文本 / JSON 对比加载中…</span>
  </div>
</template>

<style scoped>
.text-json-diff-loading {
  display: grid;
  min-height: max(620px, calc(100dvh - var(--header-height) - 226px));
  border: 1px solid var(--color-border);
  border-radius: 13px;
  place-content: center;
  justify-items: center;
  gap: 12px;
  background: var(--color-surface-solid);
  color: var(--color-text-muted);
  box-shadow: 0 4px 18px rgb(16 24 40 / 3%);
  font-size: 12px;
}

.text-json-diff-loading__spinner {
  width: 28px;
  height: 28px;
  border: 2px solid color-mix(in srgb, var(--tools-accent) 18%, transparent);
  border-top-color: var(--tools-accent);
  border-radius: 50%;
  animation: text-json-diff-loading-spin 800ms linear infinite;
}

@keyframes text-json-diff-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .text-json-diff-loading {
    min-height: max(540px, calc(100dvh - var(--header-height) - 216px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .text-json-diff-loading__spinner {
    animation: none;
  }
}
</style>
