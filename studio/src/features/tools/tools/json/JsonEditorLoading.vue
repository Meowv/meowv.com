<template>
  <div class="json-editor-loading" role="status" aria-live="polite" aria-busy="true">
    <span class="json-editor-loading__spinner" aria-hidden="true"></span>
    <span>JSON 编辑器加载中…</span>
  </div>
</template>

<style scoped>
.json-editor-loading {
  display: grid;
  min-height: max(563px, calc(100dvh - var(--header-height) - 218px));
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

.json-editor-loading__spinner {
  width: 28px;
  height: 28px;
  border: 2px solid color-mix(in srgb, var(--tools-accent) 18%, transparent);
  border-top-color: var(--tools-accent);
  border-radius: 50%;
  animation: json-editor-loading-spin 800ms linear infinite;
}

@keyframes json-editor-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .json-editor-loading {
    min-height: max(483px, calc(100dvh - var(--header-height) - 216px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .json-editor-loading__spinner {
    animation: none;
  }
}
</style>
